"""archive_service.py

Single entry point for creating archive metadata rows.

Binary storage is fully delegated to the active storage backend
(see ``storage_backend.get_storage_backend()``). This service never
touches the filesystem directly and does not hard-code any storage paths.

If an ``ExportConfig`` row exists for the company, its ``folder_pattern``
and ``file_pattern`` are rendered against a runtime context and forwarded
to the backend as ``folder_hint`` / ``filename_hint``.  The extension is
always taken from the original file — the file_pattern is treated as a
base-name template only.

Public API
----------
store_file(db, company_id, original_filename, file_bytes,
           expense_id=None, source_type="upload") -> ArchiveFile

    Saves *file_bytes* via the configured storage backend and persists a
    metadata row in ``archive_files``.  The returned ``ArchiveFile`` instance
    has been committed and refreshed.
"""

from __future__ import annotations

import re
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy.orm import Session

from packages.core.platform.models_archive_config import ArchiveConfig
from packages.core.platform.models_archive_file import ArchiveFile
from packages.core.platform.models_storage_config import StorageConfig
from packages.modules.archive.service.storage_backend import get_storage_backend


# ── Pattern rendering ──────────────────────────────────────────────────────────

def _render(pattern: str, context: dict) -> str:
    """Replace ``{key}`` tokens using *context*; unknown tokens are left as-is."""
    def _sub(match: re.Match) -> str:
        key = match.group(1)
        return str(context[key]) if key in context else match.group(0)
    return re.sub(r"\{(\w+)\}", _sub, pattern)


def _strip_extension(pattern: str) -> str:
    """Remove a trailing dot-extension from a rendered pattern string.

    The extension is always sourced from the original file, so any extension
    accidentally included in the pattern (e.g. ``.csv``) is stripped to avoid
    double extensions like ``receipt.csv.pdf``.
    """
    stem = Path(pattern).stem
    # If the stem is empty after stripping (pattern was only ".ext"), fall back
    # to the full pattern so callers receive something non-empty.
    return stem if stem else pattern


def _build_context(
    company_id: int,
    original_filename: str,
    expense_id: int | None,
    company_slug: str,
) -> dict:
    now = datetime.now(tz=timezone.utc)
    return {
        "company":   company_slug,
        "company_id": str(company_id),
        "expense_id": str(expense_id) if expense_id is not None else "",
        "date":      now.strftime("%Y-%m-%d"),
        "year":      now.strftime("%Y"),
        "month":     now.strftime("%m"),
        "day":       now.strftime("%d"),
        "filename":  Path(original_filename).stem,
    }


# ── Default patterns (used when no ExportConfig row exists) ────────────────────

_DEFAULT_FOLDER_PATTERN   = "{year}/{month}"
_DEFAULT_FILENAME_PATTERN = "{company}_{date}_{filename}"


def _resolve_hints(
    db: Session,
    company_id: int,
    original_filename: str,
    expense_id: int | None,
) -> tuple[str | None, str | None]:
    """Return ``(folder_hint, filename_hint)`` rendered from config or defaults.

    Looks up the company's ``ExportConfig``.  If none exists, falls back to
    safe built-in defaults.  Never raises — on any error returns ``(None, None)``
    so the caller can proceed without hints.
    """
    try:
        cfg = (
            db.query(ArchiveConfig)
            .filter(ArchiveConfig.company_id == company_id)
            .first()
        )

        folder_pattern   = cfg.folder_pattern if cfg else _DEFAULT_FOLDER_PATTERN
        filename_pattern = cfg.file_pattern    if cfg else _DEFAULT_FILENAME_PATTERN

        # Derive a company slug: prefer display_name from CompanySetup if
        # available, fall back to "company{id}".
        company_slug = _resolve_company_slug(db, company_id)

        context = _build_context(
            company_id=company_id,
            original_filename=original_filename,
            expense_id=expense_id,
            company_slug=company_slug,
        )

        folder_hint   = _render(folder_pattern, context).strip("/")
        filename_hint = _strip_extension(_render(filename_pattern, context))

        return folder_hint or None, filename_hint or None

    except Exception:  # noqa: BLE001 — hints are best-effort; never block upload
        return None, None


def _resolve_company_slug(db: Session, company_id: int) -> str:
    """Return a URL-safe company identifier for use in storage keys.

    Tries ``CompanySetup.display_name`` → slugified.
    Falls back to ``"company{id}"`` if nothing is available.
    """
    try:
        from packages.core.platform.models_company_setup import CompanySetup  # local import avoids circular deps

        setup = db.query(CompanySetup).filter(CompanySetup.company_id == company_id).first()
        if setup and setup.display_name:
            # Simple slug: lowercase, replace spaces/special chars with hyphens
            slug = re.sub(r"[^a-z0-9]+", "-", setup.display_name.lower()).strip("-")
            return slug or f"company{company_id}"
    except Exception:  # noqa: BLE001
        pass
    return f"company{company_id}"


# ── Public API ─────────────────────────────────────────────────────────────────


def store_file(
    db: Session,
    company_id: int,
    original_filename: str,
    file_bytes: bytes,
    *,
    expense_id: int | None = None,
    source_type: str = "upload",
    content_text: str | None = None,
) -> ArchiveFile:
    """Save *file_bytes* and create the corresponding ``ArchiveFile`` record.

    Parameters
    ----------
    db:
        Active SQLAlchemy session.
    company_id:
        Owning company.
    original_filename:
        Filename as provided by the uploader; extension is preserved verbatim.
    file_bytes:
        Raw binary content to persist.
    expense_id:
        Optional FK to the associated expense row.
    source_type:
        How the file entered the archive.
        One of ``"upload"`` | ``"xml"`` | ``"generated"`` | ``"extracted"`` | ``"manual"`` | ``"import"``.
        Defaults to ``"upload"``.
    content_text:
        Pre-extracted text content (e.g. decoded XML, OCR'd PDF text).
        Stored verbatim; ``None`` when caller has no text to provide.

    Returns
    -------
    ArchiveFile
        Committed and refreshed ORM instance.
    """
    folder_hint, filename_hint = _resolve_hints(
        db=db,
        company_id=company_id,
        original_filename=original_filename,
        expense_id=expense_id,
    )

    # Resolve storage config: company-specific first, then platform default (company_id=0)
    db_cfg: dict | None = None
    try:
        scfg = (
            db.query(StorageConfig)
            .filter(StorageConfig.company_id == company_id)
            .first()
        ) or (
            db.query(StorageConfig)
            .filter(StorageConfig.company_id == 0)
            .first()
        )
        if scfg:
            db_cfg = {
                "backend":         scfg.backend,
                "local_path":      scfg.local_path,
                "endpoint_url":    scfg.endpoint_url,
                "bucket":          scfg.bucket,
                "prefix":          scfg.prefix,
                "region":          scfg.region,
                "azure_account":   scfg.azure_account,
                "azure_container": scfg.azure_container,
            }
    except Exception:  # noqa: BLE001 — config lookup is best-effort
        pass

    backend = get_storage_backend(db_cfg=db_cfg)

    result = backend.save_bytes(
        company_id=company_id,
        original_filename=original_filename,
        file_bytes=file_bytes,
        folder_hint=folder_hint,
        filename_hint=filename_hint,
    )

    record = ArchiveFile(
        company_id=company_id,
        expense_id=expense_id,
        file_name=result["original_filename"],
        file_type=result["file_type"],
        source_type=source_type,
        storage_backend=result["storage_backend"],
        storage_key=result["storage_key"],
        content_text=content_text,
    )
    db.add(record)
    db.commit()
    db.refresh(record)

    # Phase 8.1 — best-effort embedding ingestion. Non-blocking on failure so
    # archive writes never fail because of an embedding/Ollama hiccup.
    if content_text and content_text.strip():
        try:
            from packages.modules.ai.service.embedding_service import index_document

            index_document(
                db,
                company_id=company_id,
                text=content_text,
                expense_id=expense_id,
                meta={
                    "archive_file_id": record.id,
                    "source_type": source_type,
                    "filename": result["original_filename"],
                },
            )
            db.commit()
        except Exception:
            db.rollback()

    return record


def purge_archive_files_for_expense(
    db: Session,
    company_id: int,
    expense_id: int,
    filename: str,
) -> int:
    """Permanently delete every ArchiveFile row + stored bytes matching the
    given expense + filename. Returns the number of rows removed.

    Used when a draft expense document is deleted and must leave no trace.
    """
    rows = (
        db.query(ArchiveFile)
        .filter(
            ArchiveFile.company_id == company_id,
            ArchiveFile.expense_id == expense_id,
            ArchiveFile.file_name  == filename,
        )
        .all()
    )
    if not rows:
        return 0

    # Resolve the same storage backend used at write time.
    db_cfg: dict | None = None
    try:
        scfg = (
            db.query(StorageConfig).filter(StorageConfig.company_id == company_id).first()
        ) or (
            db.query(StorageConfig).filter(StorageConfig.company_id == 0).first()
        )
        if scfg:
            db_cfg = {
                "backend":         scfg.backend,
                "local_path":      scfg.local_path,
                "endpoint_url":    scfg.endpoint_url,
                "bucket":          scfg.bucket,
                "prefix":          scfg.prefix,
                "region":          scfg.region,
                "azure_account":   scfg.azure_account,
                "azure_container": scfg.azure_container,
            }
    except Exception:  # noqa: BLE001
        pass

    backend = get_storage_backend(db_cfg=db_cfg)

    removed = 0
    for row in rows:
        try:
            backend.delete_bytes(row.storage_key)
        except Exception:  # noqa: BLE001 — DB row removal still proceeds
            pass
        db.delete(row)
        removed += 1
    db.commit()
    return removed
