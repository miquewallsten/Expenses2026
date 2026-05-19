"""Modern agent orchestrator for VS Code agent system integration.

This orchestrator coordinates specialized agent teams and provides
Super Admin with centralized management capabilities.

Phase 8: Replaced in-memory dicts with PostgreSQL-backed storage via
OrchestratorSession, OrchestratorTeamMetrics, and OrchestratorRequestLog.
Falls back to in-memory dicts when no db session is available.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from .context import AgentContext, Persona
from .engine import run_turn
from .registry import REGISTRY, ToolResult
from .routing import scoped_model, select_model
from ..models_definitions import AgentDefinition
from .agent_definition_service import AGENT_DEF_SERVICE
from packages.core.cache.redis_client import SessionStore, REDIS_AVAILABLE

_log = logging.getLogger(__name__)


@dataclass
class AgentTeam:
    """Represents a specialized agent team with domain expertise."""
    name: str
    description: str
    personas: List[Persona]
    capabilities: List[str]
    priority: int = 1
    

class AgentOrchestrator:
    """Coordinates specialized agent teams for Financial Ops platform.

    Uses DB-backed tables for persistent state when a db Session is available.
    Falls back to in-memory dicts when no db is provided (e.g. tests).
    """

    def __init__(self):
        self.def_svc = AGENT_DEF_SERVICE
        # In-memory fallbacks (used when db is not available)
        self.active_sessions: Dict[str, Any] = {}
        self.session_store = SessionStore() if REDIS_AVAILABLE else None
        self.performance_metrics: Dict[str, Dict] = {}
        self.teams: Dict[str, AgentTeam] = {}

        # Real-time tracking for Super Admin
        self.total_requests = 0
        self.successful_requests = 0
        self.failed_requests = 0
        self.active_requests: Dict[str, Dict] = {}
        self.request_history: List[Dict] = []
        self._max_history = 500
        self.start_time = time.time()

    # ── Session persistence (DB-backed) ────────────────────────────────────

    def _store_session(self, session_id: str, data: dict, ttl: int = 3600, db: Session | None = None) -> None:
        """Store session in DB, Redis, or in-memory (in that order of preference)."""
        if db is not None:
            try:
                from ..models_orchestrator import OrchestratorSession
                from datetime import datetime, timezone, timedelta
                expires = datetime.now(timezone.utc) + timedelta(seconds=ttl)
                row = db.query(OrchestratorSession).filter(
                    OrchestratorSession.session_id == session_id
                ).first()
                if row:
                    row.data = json.dumps(data)
                    row.expires_at = expires
                else:
                    row = OrchestratorSession(
                        session_id=session_id,
                        company_id=data.get("company_id", 0),
                        data=json.dumps(data),
                        expires_at=expires,
                    )
                    db.add(row)
                db.commit()
                return
            except Exception:
                _log.warning("DB session store failed, falling back to Redis/memory")

        if self.session_store:
            self.session_store.save(session_id, data, ttl)
        else:
            self.active_sessions[session_id] = {
                "data": data,
                "expires": time.time() + ttl,
            }

    def _get_session(self, session_id: str, db: Session | None = None) -> dict | None:
        """Get session from DB, Redis, or in-memory."""
        if db is not None:
            try:
                from ..models_orchestrator import OrchestratorSession
                from datetime import datetime, timezone
                row = db.query(OrchestratorSession).filter(
                    OrchestratorSession.session_id == session_id,
                    OrchestratorSession.expires_at > datetime.now(timezone.utc),
                ).first()
                if row:
                    return json.loads(row.data)
            except Exception:
                pass

        if self.session_store:
            return self.session_store.get(session_id)
        session = self.active_sessions.get(session_id)
        if session and session.get("expires", 0) > time.time():
            return session.get("data")
        return None

    # ── Team metrics (DB-backed) ───────────────────────────────────────────

    def _track_performance(self, team_name: str, result: Dict[str, Any], db: Session | None = None) -> None:
        """Track performance metrics for agent teams."""
        # Update in-memory counters (always)
        if team_name not in self.performance_metrics:
            self.performance_metrics[team_name] = {
                "total_requests": 0,
                "successful_requests": 0,
                "average_response_time": 0,
                "tool_usage": {}
            }
        
        metrics = self.performance_metrics[team_name]
        metrics["total_requests"] += 1
        
        if result.get("ok", False):
            metrics["successful_requests"] += 1
        
        # Track tool usage
        for tool_call in result.get("tool_calls", []):
            tool_name = tool_call.get("tool", "unknown")
            metrics["tool_usage"][tool_name] = metrics["tool_usage"].get(tool_name, 0) + 1

        # Persist to DB if available
        if db is not None:
            try:
                from ..models_orchestrator import OrchestratorTeamMetrics
                row = db.query(OrchestratorTeamMetrics).filter(
                    OrchestratorTeamMetrics.team_name == team_name
                ).first()
                if row:
                    row.total_requests = metrics["total_requests"]
                    row.successful_requests = metrics["successful_requests"]
                    row.failed_requests = metrics["total_requests"] - metrics["successful_requests"]
                    row.tool_usage = json.dumps(metrics["tool_usage"])
                else:
                    row = OrchestratorTeamMetrics(
                        team_name=team_name,
                        total_requests=metrics["total_requests"],
                        successful_requests=metrics["successful_requests"],
                        failed_requests=0,
                        tool_usage=json.dumps(metrics["tool_usage"]),
                    )
                    db.add(row)
                db.commit()
            except Exception:
                _log.warning("Failed to persist team metrics to DB")

    # ── Request logging (DB-backed) ────────────────────────────────────────

    def _log_request(self, request_id: str, data: dict, db: Session | None = None) -> None:
        """Log a request for the Super Admin dashboard."""
        # In-memory (always)
        self.active_requests[request_id] = data
        self.request_history.append(data)
        if len(self.request_history) > self._max_history:
            self.request_history = self.request_history[-self._max_history:]

        # DB persist if available
        if db is not None:
            try:
                from ..models_orchestrator import OrchestratorRequestLog
                row = OrchestratorRequestLog(
                    request_id=request_id,
                    company_id=data.get("company_id"),
                    team=data.get("team"),
                    status=data.get("status", "processing"),
                    user_message_preview=data.get("user_message", "")[:200],
                    started_at=data.get("start_time", time.time()),
                )
                db.add(row)
                db.commit()
            except Exception:
                _log.warning("Failed to persist request log to DB")

    def _finish_request(self, request_id: str, result_ok: bool, db: Session | None = None) -> None:
        """Mark a request as finished."""
        self.active_requests.pop(request_id, None)
        if result_ok:
            self.successful_requests += 1
        else:
            self.failed_requests += 1

        if db is not None:
            try:
                from ..models_orchestrator import OrchestratorRequestLog
                row = db.query(OrchestratorRequestLog).filter(
                    OrchestratorRequestLog.request_id == request_id
                ).first()
                if row:
                    row.status = "completed"
                    row.finished_at = time.time()
                    row.result_ok = result_ok
                    db.commit()
            except Exception:
                pass

    def get_team_performance(self) -> Dict[str, Any]:
        """Per-team breakdown for the Super Admin dashboard."""
        out: Dict[str, Any] = {}
        for name, team in self.teams.items():
            m = self.performance_metrics.get(name, {})
            total = m.get("total_requests", 0)
            ok = m.get("successful_requests", 0)
            out[name] = {
                "team": name,
                "description": team.description,
                "total_requests": total,
                "successful_requests": ok,
                "failed_requests": total - ok,
                "success_rate": ok / total if total else 0.0,
                "avg_duration": 0.0,
            }
        return out
    
    async def route_request(self, ctx: AgentContext, user_message: str) -> Dict[str, Any]:
        """Route requests to appropriate agent teams using the Orchestrator Agent.
        
        The process is:
        1. Call run_turn() using the 'orchestrator' agent definition.
        2. Parse the JSON response to get the target agent_key and confidence.
        3. If confidence is high enough, call run_turn() again with the target agent.
        4. Otherwise, fallback to the 'config' agent.
        """
        request_id = f"req_{int(time.time() * 1000)}_{self.total_requests}"
        
        # Track request start
        self.total_requests += 1
        self._log_request(request_id, {
            "team": "orchestrating",
            "start_time": time.time(),
            "status": "processing",
            "user_message": user_message[:100],
            "company_id": ctx.company_id,
        }, db=ctx.db)
        
        try:
            # 1. Get the orchestrator definition
            orch_def = self.def_svc.get_by_key(ctx.db, "orchestrator")
            if not orch_def:
                raise RuntimeError("Orchestrator agent definition missing from DB")

            base_kwargs = {
                "db": ctx.db,
                "user": ctx,
                "company_id": ctx.company_id,
                "user_message": user_message,
                "locale": ctx.locale,
            }
            routing_result = run_turn(**base_kwargs, persona=ctx.persona, agent_definition=orch_def)
            
            content = routing_result.get("content", "").strip()
            
            # Parse JSON response: {"agent_key": "...", "confidence": 0.9}
            try:
                routing_data = json.loads(content)
                target_key = routing_data.get("agent_key", "config")
                confidence = float(routing_data.get("confidence", 0.5))
            except (json.JSONDecodeError, ValueError):
                target_key = "config"
                confidence = 0.5
            
            # 2. If confidence is low, fallback to config agent
            if confidence < 0.6:
                target_key = "config"
            
            # 3. Route to the appropriate team/agent
            team = self.teams.get(target_key)
            if team and len(team.personas) > 0:
                result = await self._handle_single_team(team, ctx, user_message)
            else:
                # Fallback: use the target_key to look up an agent definition
                target_def = self.def_svc.get_by_key(ctx.db, target_key)
                persona = target_key if target_key in ("admin", "accounting") else "admin"
                if target_def:
                    result = run_turn(**base_kwargs, persona=persona, agent_definition=target_def)
                else:
                    result = run_turn(**base_kwargs, persona=persona, user=ctx)
            
            self._finish_request(request_id, result.get("ok", False), db=ctx.db)
            return result
            
        except Exception as exc:
            self._finish_request(request_id, False, db=ctx.db)
            _log.error("Orchestrator routing failed: %s", exc)
            return {"ok": False, "error": str(exc), "content": ""}
    
    async def _handle_single_team(self, team: AgentTeam, ctx: AgentContext, user_message: str) -> Dict[str, Any]:
        """Handle a request with a single agent team."""
        persona = team.personas[0] if team.personas else "admin"
        result = run_turn(
            db=ctx.db,
            user=ctx,
            company_id=ctx.company_id,
            persona=persona,
            user_message=user_message,
            locale=ctx.locale,
        )
        self._track_performance(team.name, result, db=ctx.db)
        return result
    
    async def _handle_multi_team(self, teams: List[AgentTeam], ctx: AgentContext, user_message: str) -> Dict[str, Any]:
        """Coordinate multiple agent teams for complex requests."""
        primary_team = max(teams, key=lambda t: t.priority)
        return await self._handle_single_team(primary_team, ctx, user_message)
    
    def get_performance_report(self) -> Dict[str, Any]:
        """Get performance report for Super Admin."""
        return {
            "teams": self.performance_metrics,
            "total_requests": sum(team["total_requests"] for team in self.performance_metrics.values()),
            "success_rate": (
                sum(team["successful_requests"] for team in self.performance_metrics.values()) /
                sum(team["total_requests"] for team in self.performance_metrics.values())
                if sum(team["total_requests"] for team in self.performance_metrics.values()) > 0
                else 0
            )
        }
    
    def get_team_status(self) -> Dict[str, Any]:
        """Get current status of all agent teams."""
        status = {}
        for team_name, team in self.teams.items():
            status[team_name] = {
                "name": team.name,
                "description": team.description,
                "active": team_name in self.performance_metrics,
                "request_count": self.performance_metrics.get(team_name, {}).get("total_requests", 0),
                "success_rate": (
                    self.performance_metrics.get(team_name, {}).get("successful_requests", 0) /
                    self.performance_metrics.get(team_name, {}).get("total_requests", 1)
                    if self.performance_metrics.get(team_name, {}).get("total_requests", 0) > 0
                    else 0
                )
            }
        return status

    def get_real_time_metrics(self) -> Dict[str, Any]:
        """Get real-time metrics for Super Admin dashboard."""
        import time
        return {
            "total_requests": self.total_requests,
            "successful_requests": self.successful_requests,
            "failed_requests": self.failed_requests,
            "success_rate": (
                self.successful_requests / self.total_requests 
                if self.total_requests > 0 else 0
            ),
            "active_requests": len(self.active_requests),
            "active_requests_details": list(self.active_requests.values()),
            "uptime": time.time() - self.start_time,
            "request_history": self.request_history[-50:] # Last 50 requests
        }

    def update_team_config(self, team_name: str, config: Dict[str, Any]) -> bool:
        """Update a team's configuration globally."""
        if team_name not in self.teams:
            return False
        
        team = self.teams[team_name]
        if "description" in config:
            team.description = config["description"]
        if "priority" in config:
            team.priority = config["priority"]
        if "capabilities" in config:
            team.capabilities = config["capabilities"]
            
        return True

    def add_new_team(self, name: str, description: str, personas: List[Persona], capabilities: List[str]) -> str:
        """Provision a new specialized agent team."""
        team_id = name.lower().replace(" ", "_")
        self.teams[team_id] = AgentTeam(
            name=name,
            description=description,
            personas=personas,
            capabilities=capabilities
        )
        return team_id


# Global orchestrator instance
ORCHESTRATOR = AgentOrchestrator()
