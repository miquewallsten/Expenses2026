"""Phase 4.8 — CFDI lifecycle: cancel watcher + Anexo 24 UUIDs in pólizas."""
from __future__ import annotations

from datetime import date, datetime, timedelta
from decimal import Decimal

import pytest
from sqlalchemy.orm import Session

from packages.core.platform.models import Company
from packages.modules.expenses.models.expense import Expense
from packages.modules.expenses.service import cfdi_lifecycle_service as svc
from packages.modules.integrations.models_public_api import (
    WebhookDelivery,
    WebhookSubscription,
)
from packages.modules.accounting.service.poliza_export_service import (
    render_contpaqi,
    render_sat_polizas,
)


@pytest.fixture
def co48(db_session: Session) -> Company:
    co = Company(name="P48", slug="p48")
    db_session.add(co)
    db_session.commit()
    db_session.refresh(co)
    return co


def _make_expense(db, co_id, *, uuid=None, cfdi_status=None, last_checked=None) -> Expense:
    e = Expense(
        company_id=co_id,
        amount=Decimal("100.00"),
        description="X",
        status="approved",
        expense_date=date(2026, 4, 1),
        cfdi_uuid=uuid,
        cfdi_status=cfdi_status,
        cfdi_last_checked_at=last_checked,
    )
    db.add(e)
    db.commit()
    db.refresh(e)
    return e


def test_recheck_noop_when_no_uuid(db_session: Session, co48: Company) -> None:
    e = _make_expense(db_session, co48.id, uuid=None)
    res = svc.recheck_expense_cfdi(db_session, e)
    assert res == {"status": None, "changed": False, "cancelled": False}
    assert e.cfdi_last_checked_at is None


def test_recheck_persists_status_and_no_event_on_first_vigente(
    db_session: Session, co48: Company, monkeypatch
) -> None:
    e = _make_expense(db_session, co48.id, uuid="UUID-A")
    monkeypatch.setattr(
        svc, "check_cfdi_with_sat",
        lambda *a, **k: {"sat_status": "Vigente"},
    )
    res = svc.recheck_expense_cfdi(db_session, e)
    assert res["status"] == "Vigente"
    assert res["cancelled"] is False
    assert e.cfdi_status == "Vigente"
    assert e.cfdi_last_checked_at is not None
    assert db_session.query(WebhookDelivery).count() == 0


def test_recheck_emits_cfdi_cancelled_event_on_flip(
    db_session: Session, co48: Company, monkeypatch
) -> None:
    db_session.add(WebhookSubscription(
        company_id=co48.id,
        event_type="cfdi.cancelled",
        target_url="https://erp.example/wh",
        secret="s" * 32,
        is_enabled=True,
    ))
    db_session.commit()
    e = _make_expense(db_session, co48.id, uuid="UUID-B", cfdi_status="Vigente")
    monkeypatch.setattr(
        svc, "check_cfdi_with_sat",
        lambda *a, **k: {"sat_status": "Cancelado"},
    )
    res = svc.recheck_expense_cfdi(db_session, e)
    assert res["cancelled"] is True
    assert e.cfdi_status == "Cancelado"
    deliveries = db_session.query(WebhookDelivery).all()
    assert len(deliveries) == 1
    assert deliveries[0].event_type == "cfdi.cancelled"
    assert deliveries[0].payload["expense_id"] == e.id
    assert deliveries[0].payload["cfdi_uuid"] == "UUID-B"


def test_recheck_no_double_event_when_already_cancelled(
    db_session: Session, co48: Company, monkeypatch
) -> None:
    db_session.add(WebhookSubscription(
        company_id=co48.id,
        event_type="cfdi.cancelled",
        target_url="https://erp.example/wh",
        secret="s" * 32,
        is_enabled=True,
    ))
    db_session.commit()
    e = _make_expense(db_session, co48.id, uuid="UUID-C", cfdi_status="Cancelado")
    monkeypatch.setattr(
        svc, "check_cfdi_with_sat",
        lambda *a, **k: {"sat_status": "Cancelado"},
    )
    svc.recheck_expense_cfdi(db_session, e)
    assert db_session.query(WebhookDelivery).count() == 0


def test_recheck_pending_skips_recent_and_cancelled(
    db_session: Session, co48: Company, monkeypatch
) -> None:
    fresh = datetime.utcnow() - timedelta(days=1)
    stale = datetime.utcnow() - timedelta(days=30)
    e_fresh = _make_expense(
        db_session, co48.id, uuid="U-fresh", cfdi_status="Vigente", last_checked=fresh
    )
    e_stale = _make_expense(
        db_session, co48.id, uuid="U-stale", cfdi_status="Vigente", last_checked=stale
    )
    e_cancelled = _make_expense(
        db_session, co48.id, uuid="U-cnx", cfdi_status="Cancelado", last_checked=stale
    )
    e_never = _make_expense(db_session, co48.id, uuid="U-never")

    calls: list[str] = []

    def fake(uuid, *a, **k):
        calls.append(uuid)
        return {"sat_status": "Vigente"}

    monkeypatch.setattr(svc, "check_cfdi_with_sat", fake)

    out = svc.recheck_pending(db_session, company_id=co48.id, stale_after_days=7)
    assert out["checked"] == 2
    assert out["flipped"] == 0
    assert set(calls) == {"U-stale", "U-never"}
    # leakage: untouched
    db_session.refresh(e_fresh)
    db_session.refresh(e_cancelled)
    assert e_fresh.cfdi_last_checked_at == fresh
    assert e_cancelled.cfdi_status == "Cancelado"


def test_render_contpaqi_emits_compnal_when_uuid_present() -> None:
    bulk = {
        "rows": [{
            "expense_id": 1,
            "date": "2026-04-01",
            "description": "Test",
            "cfdi_uuid": "AAAA-BBBB-CCCC",
            "lines": [
                {"account_code": "601", "debit": "100.00", "credit": "0", "note": "n"},
                {"account_code": "201", "debit": "0", "credit": "100.00", "note": "n"},
            ],
        }]
    }
    xml = render_contpaqi(bulk)
    assert 'CompNal="AAAA-BBBB-CCCC"' in xml
    # both movements get the UUID
    assert xml.count('CompNal="AAAA-BBBB-CCCC"') == 2

    # Without uuid, attr absent
    bulk2 = {"rows": [{**bulk["rows"][0], "cfdi_uuid": None}]}
    xml2 = render_contpaqi(bulk2)
    assert "CompNal" not in xml2


def test_render_sat_polizas_emits_compnal_subelement() -> None:
    bulk = {
        "rows": [{
            "expense_id": 7,
            "date": "2026-04-01",
            "description": "T",
            "cfdi_uuid": "ZZZZ-1111",
            "lines": [
                {"account_code": "601", "debit": "50", "credit": "0", "note": "x"},
            ],
        }]
    }
    xml = render_sat_polizas(bulk)
    assert "<PLZ:CompNal" in xml
    assert 'UUID_CFDI="ZZZZ-1111"' in xml
