"""Phase 1.6 — inbound CFDI XML → draft Expense pipeline."""

from __future__ import annotations

import base64
from decimal import Decimal

import pytest
from sqlalchemy.orm import Session

from packages.core.platform.models import Company
from packages.core.platform.models_audit import AuditLog
from packages.modules.channels.schemas import (
    InboundAttachment,
    NormalizedMessage,
)
from packages.modules.channels.service.inbound_drafts import (
    try_create_draft_from_email,
)
from packages.modules.expenses.models.expense import Expense


_CFDI_XML = """<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4"
                  Version="4.0"
                  Total="123.45"
                  SubTotal="106.42"
                  Folio="A123"
                  Fecha="2026-01-15T10:00:00">
  <cfdi:Emisor Rfc="EKU9003173C9" Nombre="Vendor SA"/>
  <cfdi:Receptor Rfc="XAXX010101000" Nombre="Acme"/>
  <cfdi:Complemento>
    <tfd:TimbreFiscalDigital
        xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital"
        UUID="11111111-2222-3333-4444-555555555555"
        FechaTimbrado="2026-01-15T10:00:01"/>
  </cfdi:Complemento>
</cfdi:Comprobante>
"""


@pytest.fixture
def company(db_session: Session) -> Company:
    c = Company(name="Acme", slug="acme")
    db_session.add(c)
    db_session.commit()
    return c


def _make_norm(company_id: int, atts: list[InboundAttachment]) -> NormalizedMessage:
    return NormalizedMessage(
        channel="email",
        company_id=company_id,
        sender_ref="ana@example.com",
        thread_id="<msg@x>",
        body="See attached invoice",
        attachments=atts,
        raw={},
    )


def test_cfdi_xml_creates_draft_expense(
    db_session: Session, company: Company, tmp_path, monkeypatch
) -> None:
    monkeypatch.setenv("STORAGE_ROOT", str(tmp_path))
    # Re-import module so it picks up the env override.
    import importlib

    from packages.modules.channels.service import inbound_drafts as mod

    importlib.reload(mod)

    b64 = base64.b64encode(_CFDI_XML.encode("utf-8")).decode("ascii")
    norm = _make_norm(
        company.id,
        [
            InboundAttachment(
                filename="factura.xml",
                content_type="text/xml",
                content_b64=b64,
            )
        ],
    )

    expense = mod.try_create_draft_from_email(db_session, norm)
    assert expense is not None
    assert expense.amount == Decimal("123.45")
    assert expense.status == "draft"
    assert "11111111-2222-3333-4444-555555555555" in expense.description
    assert "EKU9003173C9" in expense.description

    # XML persisted to STORAGE_ROOT/cfdi-inbound/<company>/...
    persisted = list((tmp_path / "cfdi-inbound" / str(company.id)).iterdir())
    assert len(persisted) == 1
    assert persisted[0].read_bytes().startswith(b"<?xml")

    # Audit log was emitted.
    audits = (
        db_session.query(AuditLog)
        .filter(
            AuditLog.entity_type == "expense",
            AuditLog.entity_id == expense.id,
            AuditLog.action == "created_from_email",
        )
        .all()
    )
    assert len(audits) == 1


def test_no_xml_attachment_returns_none(db_session: Session, company: Company) -> None:
    norm = _make_norm(
        company.id,
        [
            InboundAttachment(
                filename="receipt.pdf",
                content_type="application/pdf",
                content_b64="aGVsbG8=",
            )
        ],
    )
    assert try_create_draft_from_email(db_session, norm) is None
    assert db_session.query(Expense).count() == 0


def test_malformed_xml_returns_none(db_session: Session, company: Company) -> None:
    norm = _make_norm(
        company.id,
        [
            InboundAttachment(
                filename="broken.xml",
                content_type="text/xml",
                content_b64=base64.b64encode(b"<not-valid").decode("ascii"),
            )
        ],
    )
    assert try_create_draft_from_email(db_session, norm) is None
    assert db_session.query(Expense).count() == 0


def test_missing_b64_content_skips_silently(
    db_session: Session, company: Company
) -> None:
    norm = _make_norm(
        company.id,
        [
            InboundAttachment(
                filename="nope.xml",
                content_type="text/xml",
                content_b64=None,
            )
        ],
    )
    assert try_create_draft_from_email(db_session, norm) is None
    assert db_session.query(Expense).count() == 0


def test_xml_without_total_returns_none(
    db_session: Session, company: Company
) -> None:
    bad = _CFDI_XML.replace('Total="123.45"', "")
    norm = _make_norm(
        company.id,
        [
            InboundAttachment(
                filename="notal.xml",
                content_type="text/xml",
                content_b64=base64.b64encode(bad.encode()).decode(),
            )
        ],
    )
    assert try_create_draft_from_email(db_session, norm) is None
    assert db_session.query(Expense).count() == 0
