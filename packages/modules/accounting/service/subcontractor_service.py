"""subcontractor_service.py — subcontractor input handling.

Subcontractors (independent contractors) submit invoices/expenses that need
to be tracked separately for SAT compliance (honorarios, retenciones ISR/IVA).

Models:
  - Subcontractor: contact info, RFC, payment terms
  - SubcontractorInvoice: invoice from subcontractor with CFDI, retentions

This service provides CRUD and processing for subcontractor inputs.
"""
from __future__ import annotations

import logging
from typing import Any

from sqlalchemy.orm import Session

_log = logging.getLogger(__name__)


def list_subcontractors(db: Session, company_id: int) -> list[dict[str, Any]]:
    """List all subcontractors for a company."""
    from packages.core.platform.models_client import Client
    # Subcontractors are stored as Clients with rfc + legal_name
    clients = (
        db.query(Client)
        .filter(
            Client.company_id == company_id,
            Client.is_active.is_(True),
            Client.rfc.isnot(None),
            Client.rfc != "",
        )
        .order_by(Client.name)
        .all()
    )
    return [
        {
            "id": c.id,
            "name": c.name,
            "code": c.code,
            "rfc": c.rfc,
            "legal_name": c.legal_name,
            "contact_email": c.contact_email,
            "contact_phone": c.contact_phone,
        }
        for c in clients
    ]


def get_subcontractor(db: Session, company_id: int, client_id: int) -> dict[str, Any] | None:
    """Get a single subcontractor's details."""
    from packages.core.platform.models_client import Client
    c = db.query(Client).filter(Client.id == client_id, Client.company_id == company_id).first()
    if not c:
        return None
    return {
        "id": c.id,
        "name": c.name,
        "code": c.code,
        "rfc": c.rfc,
        "legal_name": c.legal_name,
        "contact_email": c.contact_email,
        "contact_phone": c.contact_phone,
        "address": c.address,
        "notes": c.notes,
    }


def create_subcontractor(db: Session, company_id: int, data: dict[str, Any]) -> dict[str, Any]:
    """Create a subcontractor (stored as Client with RFC)."""
    from packages.core.platform.models_client import Client

    rfc = (data.get("rfc") or "").strip()
    code = (data.get("code") or "").strip()
    if not rfc:
        raise ValueError("RFC is required for subcontractors")

    # Check duplicate RFC
    existing = db.query(Client).filter(Client.company_id == company_id, Client.rfc == rfc).first()
    if existing:
        raise ValueError(f"Client with RFC '{rfc}' already exists")

    client = Client(
        company_id=company_id,
        name=data.get("name", ""),
        code=code or rfc[:12],
        rfc=rfc,
        legal_name=data.get("legal_name"),
        contact_email=data.get("contact_email"),
        contact_phone=data.get("contact_phone"),
        address=data.get("address"),
        notes=data.get("notes"),
        status="active",
    )
    db.add(client)
    db.commit()
    db.refresh(client)
    return {"id": client.id, "name": client.name, "rfc": client.rfc}
