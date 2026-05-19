"""Custom business rule engine for accounting automation.

Complements AIPolicy (which handles validation: block/warn) with automation
rules that define ACTIONS (set_account, split_tax, etc.).

Key difference from AIPolicy:
  - AIPolicy = "block this expense" or "warn about this" (validation)
  - AccountingCustomRule = "when X, do Y" (automation: set account, split tax, etc.)

They share the same trigger points but serve different purposes.
The expense_blocker_service evaluates AIPolicy for block/warn.
This service is called by the agent and by automation hooks to apply actions.

Rules are stored in the DB and evaluated by the accounting copilot.
"""
from __future__ import annotations
import json
import logging
from datetime import datetime
from typing import Any
from sqlalchemy import Boolean, Column, Integer, String, Text, DateTime
from sqlalchemy import func as sa_func
from sqlalchemy.orm import Session
from apps.api.db import Base

_log = logging.getLogger(__name__)


class AccountingCustomRule(Base):
    """Custom accounting automation rule.
    
    Triggers: expense.submitted, expense.approved, cfdi.matched, month_close
    Actions: set_account, set_category, set_tax_behavior, split_tax,
            require_approval, flag, notify, set_poliza_format,
            block (defers to AIPolicy), warn (advisory)
    """
    __tablename__ = "accounting_custom_rules"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    company_id = Column(Integer, nullable=False, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    priority = Column(Integer, nullable=False, default=100)
    trigger = Column(String(64), nullable=False)
    condition_json = Column(Text, nullable=False, default="{}")
    action_json = Column(Text, nullable=False, default="{}")
    created_by = Column(Integer, nullable=True)
    created_at = Column(DateTime, nullable=False, server_default=sa_func.now())
    updated_at = Column(DateTime, nullable=True, onupdate=sa_func.now())


def evaluate_condition(condition: dict[str, Any], context: dict[str, Any]) -> bool:
    """Evaluate a rule condition against a context dict.
    
    Reuses the same field/operator vocabulary as AIPolicy for consistency.
    Conditions support:
      - Simple: {field, operator, value}
      - Compound: {logic: "all"|"any", rules: [{field, operator, value}, ...]}
    """
    if not condition:
        return True
    logic = condition.get("logic", "all")
    rules = condition.get("rules", [])
    if not rules:
        field = condition.get("field", "")
        operator = condition.get("operator", "==")
        value = condition.get("value")
        return _eval_single(field, operator, value, context)
    results = [_eval_single(r.get("field",""), r.get("operator","=="), r.get("value"), context) for r in rules]
    return any(results) if logic == "any" else all(results)


def _eval_single(field: str, operator: str, value: Any, context: dict[str, Any]) -> bool:
    actual = context.get(field)
    if operator in ("==", "="): return str(actual) == str(value) if actual is not None else False
    elif operator == "!=": return str(actual) != str(value) if actual is not None else True
    elif operator == ">":
        try: return float(actual or 0) > float(value)
        except: return False
    elif operator == ">=":
        try: return float(actual or 0) >= float(value)
        except: return False
    elif operator == "<":
        try: return float(actual or 0) < float(value)
        except: return False
    elif operator == "<=":
        try: return float(actual or 0) <= float(value)
        except: return False
    elif operator == "contains": return str(value).lower() in str(actual or "").lower()
    elif operator == "in": return actual in (value if isinstance(value, list) else [value])
    elif operator == "not_in": return actual not in (value if isinstance(value, list) else [value])
    elif operator == "starts_with": return str(actual or "").lower().startswith(str(value).lower())
    elif operator == "is_null": return actual is None
    elif operator == "is_not_null": return actual is not None
    return False


def describe_action(action: dict[str, Any]) -> dict[str, Any]:
    """Describe what an action would do (for display/confirmation)."""
    at = action.get("type", "")
    descs = {
        "set_account": f"Usar cuenta {action.get('account_code')}",
        "set_category": f"Clasificar como {action.get('category_code')}",
        "set_tax_behavior": f"IVA {action.get('tax_behavior')}",
        "split_tax": f"Dividir IVA: {action.get('split')}",
        "require_approval": f"Requiere aprobación de {action.get('role', 'director')}",
        "flag": f"Marcar: {action.get('reason', '')}",
        "notify": f"Notificar a {action.get('target', 'accountant')}",
        "set_poliza_format": f"Formato póliza: {action.get('format')}",
        "block": f"BLOQUEAR: {action.get('message', '')}",
        "warn": f"ADVERTIR: {action.get('message', '')}",
    }
    return {"type": at, "description": descs.get(at, f"Acción: {at}")}


def match_rules(db: Session, company_id: int, trigger: str, context: dict[str, Any]) -> list[dict[str, Any]]:
    """Find all active rules that match the given trigger and context.
    
    Returns list of {rule, actions} for the copilot to apply.
    Also checks AIPolicy rules for consistency (cross-references block/warn).
    """
    rules = (db.query(AccountingCustomRule)
        .filter(AccountingCustomRule.company_id == company_id,
            AccountingCustomRule.is_active == True,
            AccountingCustomRule.trigger == trigger)
        .order_by(AccountingCustomRule.priority).all())
    
    matched = []
    for rule in rules:
        try: condition = json.loads(rule.condition_json)
        except: condition = {}
        if evaluate_condition(condition, context):
            try: action = json.loads(rule.action_json)
            except: action = {}
            matched.append({"rule_id": rule.id, "rule_name": rule.name, "trigger": rule.trigger,
                "actions": [describe_action(action)] if action else [],
                "description": rule.description or rule.name})
    
    # Cross-reference: also check AIPolicy for block/warn on same trigger
    if trigger == "expense.submitted":
        from packages.core.platform.models_ai_policy import AIPolicy
        ai_policies = (db.query(AIPolicy)
            .filter(AIPolicy.company_id == company_id, AIPolicy.enabled == True,
                AIPolicy.scope == "expense_validation")
            .all())
        for p in ai_policies:
            rule_json = p.rule_json or {}
            when = rule_json.get("when", [])
            then = rule_json.get("then", {})
            # Convert AIPolicy when-clauses to our condition format for cross-check
            if then.get("action") in ("block", "warn"):
                matched.append({
                    "rule_id": f"ai_policy_{p.id}",
                    "rule_name": f"[Política] {p.summary}",
                    "trigger": trigger,
                    "actions": [{"type": then["action"],
                        "description": f"{'BLOQUEAR' if then['action'] == 'block' else 'ADVERTIR'}: {then.get('message', p.summary)}"}],
                    "description": p.source_text,
                    "source": "ai_policy",
                })
    
    return matched


def create_rule(db: Session, *, company_id: int, name: str, trigger: str,
    condition: dict[str, Any], action: dict[str, Any], description: str | None = None,
    priority: int = 100, created_by: int | None = None) -> AccountingCustomRule:
    """Create a new custom accounting rule.
    
    If action.type is 'block' or 'warn', also suggest creating an AIPolicy
    so the validation is enforced at submit time.
    """
    rule = AccountingCustomRule(company_id=company_id, name=name, description=description,
        is_active=True, priority=priority, trigger=trigger,
        condition_json=json.dumps(condition, ensure_ascii=False),
        action_json=json.dumps(action, ensure_ascii=False), created_by=created_by)
    db.add(rule)
    db.commit()
    db.refresh(rule)
    
    # If this is a block/warn rule, also create a corresponding AIPolicy
    action_type = action.get("type", "")
    if action_type in ("block", "warn") and trigger in ("expense.submitted", "expense.approved"):
        _sync_to_ai_policy(db, company_id, rule, created_by)
    
    return rule


def _sync_to_ai_policy(db: Session, company_id: int, rule: AccountingCustomRule, created_by: int | None) -> None:
    """Create a corresponding AIPolicy from a block/warn custom rule."""
    try:
        from packages.core.platform.models_ai_policy import AIPolicy
        condition = json.loads(rule.condition_json)
        action = json.loads(rule.action_json)
        
        # Convert our condition format to AIPolicy's when/then format
        when_clauses = []
        if "rules" in condition:
            for r in condition["rules"]:
                when_clauses.append({"field": r.get("field",""), "op": r.get("operator","="), "value": r.get("value")})
        elif "field" in condition:
            when_clauses.append({"field": condition["field"], "op": condition.get("operator","="), "value": condition.get("value")})
        
        rule_json = {
            "when": when_clauses,
            "then": {
                "action": action.get("type", "warn"),
                "message": action.get("message", action.get("reason", rule.name)),
            }
        }
        
        severity = "block" if action.get("type") == "block" else "warn"
        
        ai_policy = AIPolicy(
            company_id=company_id,
            source_text=rule.description or rule.name,
            rule_json=rule_json,
            summary=rule.name,
            scope="expense_validation",
            severity=severity,
            enabled=True,
            created_by_user_id=created_by,
        )
        db.add(ai_policy)
        db.commit()
        _log.info(f"Synced custom rule {rule.id} to AIPolicy")
    except Exception as e:
        _log.warning(f"Failed to sync custom rule {rule.id} to AIPolicy: {e}")


def list_rules(db: Session, company_id: int, *, active_only: bool = True) -> list[AccountingCustomRule]:
    q = db.query(AccountingCustomRule).filter(AccountingCustomRule.company_id == company_id)
    if active_only: q = q.filter(AccountingCustomRule.is_active == True)
    return q.order_by(AccountingCustomRule.priority, AccountingCustomRule.id).all()


def list_all_rules_with_policies(db: Session, company_id: int) -> dict[str, list[dict[str, Any]]]:
    """List both custom rules AND AI policies in a unified view.
    
    Returns: {"automation": [...], "validation": [...]}
    """
    from packages.core.platform.models_ai_policy import AIPolicy
    
    # Automation rules
    custom_rules = list_rules(db, company_id, active_only=False)
    automation = [{"id": r.id, "name": r.name, "trigger": r.trigger, "priority": r.priority,
        "is_active": r.is_active, "source": "custom_rule",
        "condition_json": r.condition_json, "action_json": r.action_json} for r in custom_rules]
    
    # Validation policies
    ai_policies = db.query(AIPolicy).filter(AIPolicy.company_id == company_id).order_by(AIPolicy.created_at.desc()).all()
    validation = [{"id": p.id, "name": p.summary, "trigger": "expense.submitted", "priority": 50,
        "is_active": p.enabled, "source": "ai_policy", "severity": p.severity,
        "rule_json": p.rule_json, "source_text": p.source_text} for p in ai_policies]
    
    return {"automation": automation, "validation": validation}


def update_rule(db: Session, rule_id: int, **kwargs) -> AccountingCustomRule | None:
    rule = db.query(AccountingCustomRule).filter(AccountingCustomRule.id == rule_id).first()
    if not rule: return None
    for k, v in kwargs.items():
        if hasattr(rule, k): setattr(rule, k, v)
    if "condition" in kwargs:
        rule.condition_json = json.dumps(kwargs["condition"], ensure_ascii=False)
    if "action" in kwargs:
        rule.action_json = json.dumps(kwargs["action"], ensure_ascii=False)
    rule.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(rule)
    return rule


def delete_rule(db: Session, rule_id: int) -> bool:
    rule = db.query(AccountingCustomRule).filter(AccountingCustomRule.id == rule_id).first()
    if not rule: return False
    rule.is_active = False
    rule.updated_at = datetime.utcnow()
    db.commit()
    return True
