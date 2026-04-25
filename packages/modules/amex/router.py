"""REST API for the Amex Reconciliation module."""
from __future__ import annotations

import logging
from typing import List

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from apps.api.auth import get_current_user, require_same_company
from apps.api.deps import get_db
from packages.core.platform.models_user import User
from packages.core.platform.module_gate import require_module
from packages.modules.amex import service
from packages.modules.amex.models import (
    AmexCfdiDocument,
    AmexStatement,
    AmexStatementLine,
)
from packages.modules.amex.schemas import (
    AutoMatchResult,
    BulkAssign,
    DocumentRead,
    LinePatch,
    LineRead,
    MatchRequest,
    StatementDetail,
    StatementRead,
    SubmitResponse,
)

_log = logging.getLogger(__name__)

router = APIRouter(
    prefix="/amex",
    tags=["amex"],
    dependencies=[Depends(require_module("amex_reconciliation"))],
)


def _allowed(user: User, company_id: int) -> None:
    require_same_company(company_id, user)


def _statement(db: Session, company_id: int, statement_id: int) -> AmexStatement:
    stmt = (
        db.query(AmexStatement)
        .filter(
            AmexStatement.id == statement_id,
            AmexStatement.company_id == company_id,
        )
        .first()
    )
    if stmt is None:
        raise HTTPException(status_code=404, detail="statement not found")
    return stmt


def _to_statement_read(db: Session, stmt: AmexStatement) -> StatementRead:
    summary = service.summarise_statement(db, stmt)
    data = StatementRead.model_validate(stmt)
    return data.model_copy(update=summary)


# ── Statements ────────────────────────────────────────────────────────────────


@router.get("/{company_id}/statements", response_model=List[StatementRead])
def list_statements(
    company_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _allowed(user, company_id)
    items = (
        db.query(AmexStatement)
        .filter(AmexStatement.company_id == company_id)
        .order_by(AmexStatement.created_at.desc())
        .all()
    )
    return [_to_statement_read(db, s) for s in items]


@router.post("/{company_id}/statements", response_model=StatementRead)
async def upload_statement(
    company_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _allowed(user, company_id)
    data = await file.read()
    try:
        stmt = service.create_statement_from_csv(
            db,
            company_id=company_id,
            reconciler_id=user.id,
            filename=file.filename or "amex.csv",
            csv_bytes=data,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return _to_statement_read(db, stmt)


@router.get("/{company_id}/statements/{statement_id}", response_model=StatementDetail)
def get_statement(
    company_id: int,
    statement_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _allowed(user, company_id)
    stmt = _statement(db, company_id, statement_id)
    lines = (
        db.query(AmexStatementLine)
        .filter(AmexStatementLine.statement_id == statement_id)
        .order_by(AmexStatementLine.posted_date.asc().nullslast(), AmexStatementLine.line_no.asc())
        .all()
    )
    docs = (
        db.query(AmexCfdiDocument)
        .filter(AmexCfdiDocument.statement_id == statement_id)
        .order_by(AmexCfdiDocument.created_at.asc())
        .all()
    )
    # Back-map matched_line_id onto documents for UI convenience.
    line_by_doc: dict[int, int] = {}
    for l in lines:
        if l.matched_document_id:
            line_by_doc[l.matched_document_id] = l.id

    doc_reads = []
    for d in docs:
        dr = DocumentRead.model_validate(d)
        dr = dr.model_copy(update={"matched_line_id": line_by_doc.get(d.id)})
        doc_reads.append(dr)

    return StatementDetail(
        statement=_to_statement_read(db, stmt),
        lines=[LineRead.model_validate(l) for l in lines],
        documents=doc_reads,
    )


@router.delete("/{company_id}/statements/{statement_id}")
def delete_statement(
    company_id: int,
    statement_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _allowed(user, company_id)
    stmt = _statement(db, company_id, statement_id)
    if stmt.status != "draft":
        raise HTTPException(status_code=400, detail="only draft statements can be deleted")
    db.delete(stmt)
    db.commit()
    return {"ok": True}


# ── Documents (XML/PDF) ───────────────────────────────────────────────────────


@router.post("/{company_id}/statements/{statement_id}/documents", response_model=List[DocumentRead])
async def upload_documents(
    company_id: int,
    statement_id: int,
    files: list[UploadFile] = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _allowed(user, company_id)
    stmt = _statement(db, company_id, statement_id)
    if stmt.status != "draft":
        raise HTTPException(status_code=400, detail="statement is already submitted")

    results: list[AmexCfdiDocument] = []
    for f in files:
        data = await f.read()
        fname = f.filename or "upload"
        lower = fname.lower()
        try:
            if lower.endswith(".xml"):
                doc = service.ingest_xml_document(
                    db,
                    company_id=company_id,
                    statement_id=statement_id,
                    filename=fname,
                    xml_bytes=data,
                )
            elif lower.endswith(".pdf"):
                doc = service.ingest_pdf_document(
                    db,
                    company_id=company_id,
                    statement_id=statement_id,
                    filename=fname,
                    pdf_bytes=data,
                )
            else:
                raise HTTPException(status_code=400, detail=f"unsupported file type: {fname}")
        except HTTPException:
            raise
        except Exception as exc:
            _log.exception("failed to ingest %s", fname)
            raise HTTPException(status_code=400, detail=f"failed to ingest {fname}: {exc}")
        results.append(doc)

    return [DocumentRead.model_validate(d) for d in results]


@router.delete("/{company_id}/statements/{statement_id}/documents/{document_id}")
def delete_document(
    company_id: int,
    statement_id: int,
    document_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _allowed(user, company_id)
    _statement(db, company_id, statement_id)
    doc = (
        db.query(AmexCfdiDocument)
        .filter(
            AmexCfdiDocument.id == document_id,
            AmexCfdiDocument.statement_id == statement_id,
        )
        .first()
    )
    if doc is None:
        raise HTTPException(status_code=404, detail="document not found")
    # Unassign any line pointing to this document.
    lines = (
        db.query(AmexStatementLine)
        .filter(AmexStatementLine.matched_document_id == document_id)
        .all()
    )
    for l in lines:
        l.matched_document_id = None
        l.status = "unmatched"
        l.match_confidence = "none"
    db.delete(doc)
    db.commit()
    return {"ok": True}


# ── Matching ──────────────────────────────────────────────────────────────────


@router.post(
    "/{company_id}/statements/{statement_id}/auto-match",
    response_model=AutoMatchResult,
)
def run_auto_match(
    company_id: int,
    statement_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _allowed(user, company_id)
    stmt = _statement(db, company_id, statement_id)
    if stmt.status != "draft":
        raise HTTPException(status_code=400, detail="statement is already submitted")
    matched, total_lines, total_docs = service.auto_match(db, statement_id=statement_id)
    return AutoMatchResult(
        matched=matched,
        total_lines=total_lines,
        total_documents=total_docs,
    )


@router.post(
    "/{company_id}/statements/{statement_id}/lines/{line_id}/match",
    response_model=LineRead,
)
def match_line(
    company_id: int,
    statement_id: int,
    line_id: int,
    req: MatchRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _allowed(user, company_id)
    _statement(db, company_id, statement_id)
    try:
        line = service.manual_match(db, line_id=line_id, document_id=req.document_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return LineRead.model_validate(line)


@router.post(
    "/{company_id}/statements/{statement_id}/lines/{line_id}/unmatch",
    response_model=LineRead,
)
def unmatch_line(
    company_id: int,
    statement_id: int,
    line_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _allowed(user, company_id)
    _statement(db, company_id, statement_id)
    try:
        line = service.unmatch(db, line_id=line_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return LineRead.model_validate(line)


# ── Line editing ──────────────────────────────────────────────────────────────


@router.patch(
    "/{company_id}/statements/{statement_id}/lines/{line_id}",
    response_model=LineRead,
)
def patch_line(
    company_id: int,
    statement_id: int,
    line_id: int,
    patch: LinePatch,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _allowed(user, company_id)
    _statement(db, company_id, statement_id)
    line = (
        db.query(AmexStatementLine)
        .filter(
            AmexStatementLine.id == line_id,
            AmexStatementLine.statement_id == statement_id,
        )
        .first()
    )
    if line is None:
        raise HTTPException(status_code=404, detail="line not found")

    data = patch.model_dump(exclude_unset=True)
    # Guard: cannot set status to "matched" without a matched document.
    if data.get("status") == "matched" and line.matched_document_id is None:
        raise HTTPException(status_code=400, detail="cannot mark matched without a CFDI")
    # Moving away from "matched" drops the document link.
    if data.get("status") in {"no_invoice", "missing", "unmatched"}:
        line.matched_document_id = None
        line.match_confidence = "none"

    for k, v in data.items():
        setattr(line, k, v)
    db.commit()
    db.refresh(line)
    return LineRead.model_validate(line)


@router.post(
    "/{company_id}/statements/{statement_id}/lines/bulk-assign",
    response_model=List[LineRead],
)
def bulk_assign_lines(
    company_id: int,
    statement_id: int,
    payload: BulkAssign,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _allowed(user, company_id)
    _statement(db, company_id, statement_id)
    if not payload.line_ids:
        return []
    lines = (
        db.query(AmexStatementLine)
        .filter(
            AmexStatementLine.statement_id == statement_id,
            AmexStatementLine.id.in_(payload.line_ids),
        )
        .all()
    )
    fields = payload.model_dump(exclude_unset=True, exclude={"line_ids"})
    for l in lines:
        if fields.get("status") == "matched" and l.matched_document_id is None:
            # Skip illegal transitions rather than failing the whole batch.
            continue
        if fields.get("status") in {"no_invoice", "missing", "unmatched"}:
            l.matched_document_id = None
            l.match_confidence = "none"
        for k, v in fields.items():
            if k == "status" and v is None:
                continue
            setattr(l, k, v)
    db.commit()
    for l in lines:
        db.refresh(l)
    return [LineRead.model_validate(l) for l in lines]


# ── Submission ────────────────────────────────────────────────────────────────


@router.post(
    "/{company_id}/statements/{statement_id}/submit",
    response_model=SubmitResponse,
)
def submit_statement(
    company_id: int,
    statement_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _allowed(user, company_id)
    stmt = _statement(db, company_id, statement_id)
    if stmt.status != "draft":
        raise HTTPException(status_code=400, detail="statement is already submitted")
    try:
        expense, report = service.submit_statement(db, stmt)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return SubmitResponse(
        statement_id=stmt.id,
        expense_id=expense.id,
        report_id=report.id,
        status=stmt.status,
    )
