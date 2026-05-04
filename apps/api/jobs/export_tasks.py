"""Celery background tasks for tenant data export processing."""

import json
import logging
import os
import tempfile
import zipfile
from datetime import datetime
from typing import Any

from celery import shared_task

logger = logging.getLogger(__name__)


@shared_task(bind=True, name="process_export_task")
def process_export_task(self, job_id: int) -> dict:
    """Process a tenant data export job in the background.

    This task:
    1. Marks job as processing
    2. Collects data from database
    3. Generates Excel reports
    4. Generates HTML viewer
    5. Collects files from storage (if include_files=True)
    6. Creates ZIP package
    7. Uploads to storage
    8. Marks job as complete

    Args:
        job_id: ExportJob ID to process

    Returns:
        dict with job_id, status, and file_size or error_message
    """
    from apps.api.db import SessionLocal
    from packages.core.platform.models import Company
    from packages.core.platform.models_export_job import ExportJob, ExportStatus
    from packages.core.platform.models_audit_event import AuditEvent
    from packages.modules.admin.service.export_service import ExportService
    from packages.modules.admin.service.excel_generator import ExcelGenerator
    from packages.modules.admin.service.html_viewer_generator import HTMLViewerGenerator
    from packages.modules.archive.service.storage_backend import get_storage_backend
    from packages.modules.expenses.models.expense import Expense
    from packages.modules.expenses.models.document import ExpenseDocument
    from packages.core.platform.models_accounting_category import AccountingCategory
    from packages.core.platform.models_archive_file import ArchiveFile

    db = SessionLocal()
    tmp_zip_path = None  # Track for cleanup on failure

    try:
        # Get the job
        job = db.query(ExportJob).filter(ExportJob.id == job_id).first()
        if not job:
            logger.error(f"Export job {job_id} not found")
            return {"job_id": job_id, "status": "error", "error_message": "Job not found"}

        # Mark as processing
        service = ExportService(db)
        service.mark_processing(job_id)
        logger.info(f"Processing export job {job_id} for company {job.company_id}")

        # Get company name
        company_name = _get_company_name(db, job.company_id)

        # Collect data
        expenses = _get_expenses(db, job.company_id, job.date_range_start, job.date_range_end)
        categories = _get_categories(db, job.company_id)
        vendors = _get_vendors(db, job.company_id, job.date_range_start, job.date_range_end)
        audit_data = []
        if job.include_audit:
            audit_data = _get_audit_events(db, job.company_id, job.date_range_start, job.date_range_end)

        # Generate Excel reports
        excel_gen = ExcelGenerator(db)
        expenses_excel = excel_gen.generate_expenses_excel(job.company_id, expenses)
        categories_excel = excel_gen.generate_categories_excel(job.company_id, categories)
        vendors_excel = excel_gen.generate_vendors_excel(job.company_id, vendors)
        audit_excel = excel_gen.generate_audit_excel(audit_data)

        # Generate HTML viewer
        html_gen = HTMLViewerGenerator()
        expenses_dicts = [_expense_to_dict(e) for e in expenses]
        categories_dicts = [_category_to_dict(c) for c in categories]
        audit_dicts = [_audit_event_to_dict(a) for a in audit_data]
        html_viewer = html_gen.generate_viewer(
            company_name=company_name,
            expenses=expenses_dicts,
            categories=categories_dicts,
            vendors=vendors,
            audit=audit_dicts,
        )

        # Generate README
        readme_html = _generate_readme_html(company_name)

        # Create ZIP package
        with tempfile.NamedTemporaryFile(suffix=".zip", delete=False) as tmp_zip:
            tmp_zip_path = tmp_zip.name

        with zipfile.ZipFile(tmp_zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
            # Excel reports folder
            zf.writestr("Excel_Reports/Gastos.xlsx", expenses_excel)
            zf.writestr("Excel_Reports/Categorias.xlsx", categories_excel)
            zf.writestr("Excel_Reports/Proveedores.xlsx", vendors_excel)
            zf.writestr("Excel_Reports/Auditoria.xlsx", audit_excel)

            # HTML viewer folder
            zf.writestr("offline_viewer/index.html", html_viewer)

            # README
            zf.writestr("README.html", readme_html)

            # Files folder (if include_files)
            if job.include_files:
                _add_files_to_zip(db, job.company_id, zf, job.date_range_start, job.date_range_end)

        # Upload ZIP to storage
        file_size = os.path.getsize(tmp_zip_path)
        download_url = _upload_export(tmp_zip_path, job_id, job.company_id)

        # Clean up temp file
        os.unlink(tmp_zip_path)

        # Mark job as complete
        service.mark_complete(job_id, download_url, file_size)
        logger.info(f"Export job {job_id} complete, size: {file_size} bytes")

        return {
            "job_id": job_id,
            "status": "complete",
            "file_size": file_size,
            "download_url": download_url,
        }

    except Exception as e:
        logger.exception(f"Export job {job_id} failed")
        error_message = str(e)

        # Mark job as failed
        try:
            service = ExportService(db)
            service.mark_failed(job_id, error_message)
        except Exception:
            logger.exception(f"Failed to mark export job {job_id} as failed")

        # Clean up temp file on failure
        if tmp_zip_path and os.path.exists(tmp_zip_path):
            try:
                os.unlink(tmp_zip_path)
            except Exception:
                pass

        return {
            "job_id": job_id,
            "status": "failed",
            "error_message": error_message,
        }

    finally:
        db.close()


def _get_expenses(
    db,
    company_id: int,
    date_start: datetime | None,
    date_end: datetime | None,
) -> list[Any]:
    """Query expenses for export.

    Args:
        db: SQLAlchemy session
        company_id: Company ID to filter by
        date_start: Optional start date filter
        date_end: Optional end date filter

    Returns:
        List of Expense objects
    """
    from sqlalchemy.orm import joinedload
    from packages.modules.expenses.models.expense import Expense

    query = (
        db.query(Expense)
        .filter(Expense.company_id == company_id)
        .options(joinedload(Expense.category))
    )

    if date_start:
        query = query.filter(Expense.expense_date >= date_start.date() if hasattr(date_start, 'date') else date_start)
    if date_end:
        query = query.filter(Expense.expense_date <= date_end.date() if hasattr(date_end, 'date') else date_end)

    return query.all()


def _get_categories(db, company_id: int) -> list[Any]:
    """Query accounting categories for export.

    Args:
        db: SQLAlchemy session
        company_id: Company ID to filter by

    Returns:
        List of AccountingCategory objects
    """
    from packages.core.platform.models_accounting_category import AccountingCategory

    return (
        db.query(AccountingCategory)
        .filter(AccountingCategory.company_id == company_id)
        .filter(AccountingCategory.is_active == True)
        .all()
    )


def _get_vendors(
    db,
    company_id: int,
    date_start: datetime | None,
    date_end: datetime | None,
) -> list[dict]:
    """Aggregate vendor data from expenses.

    Args:
        db: SQLAlchemy session
        company_id: Company ID to filter by
        date_start: Optional start date filter
        date_end: Optional end date filter

    Returns:
        List of vendor dictionaries with aggregated data
    """
    from sqlalchemy import func
    from packages.modules.expenses.models.expense import Expense

    # Build query to aggregate vendor data from expenses
    # Using cfdi data if available, falling back to detected vendor info
    query = (
        db.query(
            Expense.id,
            Expense.cfdi_uuid,
            Expense.amount,
            Expense.expense_date,
        )
        .filter(Expense.company_id == company_id)
    )

    if date_start:
        query = query.filter(Expense.expense_date >= date_start.date() if hasattr(date_start, 'date') else date_start)
    if date_end:
        query = query.filter(Expense.expense_date <= date_end.date() if hasattr(date_end, 'date') else date_end)

    expenses = query.all()

    # Group by vendor - for now, we'll extract vendor info from CFDI data
    # This is a simplified aggregation; real implementation would parse CFDI XML
    vendors_dict: dict[str, dict] = {}

    for expense in expenses:
        # Try to get vendor RFC from CFDI UUID (simplified)
        # In production, this would parse the actual CFDI XML
        vendor_key = expense.cfdi_uuid or f"unknown_{expense.id}"

        if vendor_key not in vendors_dict:
            vendors_dict[vendor_key] = {
                "rfc": "",  # Would be extracted from CFDI
                "name": f"Vendor {expense.id}",
                "expense_count": 0,
                "total_amount": 0,
                "last_expense_date": None,
            }

        vendors_dict[vendor_key]["expense_count"] += 1
        vendors_dict[vendor_key]["total_amount"] += float(expense.amount or 0)
        if expense.expense_date:
            if vendors_dict[vendor_key]["last_expense_date"] is None or expense.expense_date > vendors_dict[vendor_key]["last_expense_date"]:
                vendors_dict[vendor_key]["last_expense_date"] = expense.expense_date

    return list(vendors_dict.values())


def _get_audit_events(
    db,
    company_id: int,
    date_start: datetime | None,
    date_end: datetime | None,
) -> list[Any]:
    """Query audit events for export.

    Args:
        db: SQLAlchemy session
        company_id: Company ID to filter by
        date_start: Optional start date filter
        date_end: Optional end date filter

    Returns:
        List of AuditEvent objects
    """
    from packages.core.platform.models_audit_event import AuditEvent

    query = db.query(AuditEvent).filter(AuditEvent.company_id == company_id)

    if date_start:
        query = query.filter(AuditEvent.occurred_at >= date_start)
    if date_end:
        query = query.filter(AuditEvent.occurred_at <= date_end)

    return query.order_by(AuditEvent.occurred_at.desc()).limit(10000).all()


def _get_company_name(db, company_id: int) -> str:
    """Get company display name.

    Args:
        db: SQLAlchemy session
        company_id: Company ID

    Returns:
        Company name string
    """
    from packages.core.platform.models import Company

    company = db.query(Company).filter(Company.id == company_id).first()
    return company.name if company else f"Company {company_id}"


def _expense_to_dict(expense: Any) -> dict:
    """Convert Expense ORM to dict for export.

    Args:
        expense: Expense ORM instance

    Returns:
        Dictionary representation
    """
    category_name = ""
    if hasattr(expense, 'category') and expense.category:
        category_name = expense.category.name
    elif hasattr(expense, 'category_code') and expense.category_code:
        category_name = expense.category_code

    return {
        "id": expense.id,
        "expense_date": str(expense.expense_date) if expense.expense_date else None,
        "description": expense.description,
        "amount": float(expense.amount) if expense.amount else 0,
        "currency": "MXN",  # Default currency
        "category_name": category_name,
        "vendor_name": "",  # Would be extracted from CFDI
        "vendor_rfc": "",  # Would be extracted from CFDI
        "status": expense.status,
        "settlement_type": expense.settlement_type,
        "cfdi_uuid": expense.cfdi_uuid,
        "notes": expense.notes,
        "created_at": str(expense.created_at) if expense.created_at else None,
    }


def _category_to_dict(category: Any) -> dict:
    """Convert category to dict for export.

    Args:
        category: AccountingCategory ORM instance

    Returns:
        Dictionary representation
    """
    return {
        "code": category.code,
        "name": category.name,
        "description": "",  # AccountingCategory doesn't have description field
        "type": "expense",  # Default type
        "account_code": category.expense_account_code or "",
    }


def _audit_event_to_dict(event: Any) -> dict:
    """Convert audit event to dict for export.

    Args:
        event: AuditEvent ORM instance

    Returns:
        Dictionary representation
    """
    return {
        "id": event.id,
        "timestamp": str(event.occurred_at) if event.occurred_at else None,
        "event_type": event.event_type,
        "entity_type": event.entity_type,
        "entity_id": event.entity_id,
        "user_id": event.actor_id,
        "ip_address": event.ip_address,
        "before_data": event.before,
        "after_data": event.after,
    }


def _add_files_to_zip(
    db,
    company_id: int,
    zf: zipfile.ZipFile,
    date_start: datetime | None,
    date_end: datetime | None,
) -> None:
    """Add files from storage to the ZIP archive.

    Args:
        db: SQLAlchemy session
        company_id: Company ID
        zf: ZipFile to add files to
        date_start: Optional start date filter
        date_end: Optional end date filter
    """
    from packages.core.platform.models_archive_file import ArchiveFile
    from packages.modules.archive.service.storage_backend import get_storage_backend

    # Query archive files
    query = (
        db.query(ArchiveFile)
        .filter(ArchiveFile.company_id == company_id)
    )

    # Filter by date if specified (via expense_id relationship)
    if date_start or date_end:
        from packages.modules.expenses.models.expense import Expense
        query = query.join(Expense, ArchiveFile.expense_id == Expense.id)
        if date_start:
            query = query.filter(Expense.expense_date >= date_start.date() if hasattr(date_start, 'date') else date_start)
        if date_end:
            query = query.filter(Expense.expense_date <= date_end.date() if hasattr(date_end, 'date') else date_end)

    archive_files = query.limit(1000).all()

    # Get storage backend
    backend = get_storage_backend()

    # Track files added (to handle duplicates)
    files_added = set()
    cfdi_count = 0

    for archive_file in archive_files:
        try:
            # Read file content
            file_content = _read_file_from_storage(backend, archive_file.storage_key)
            if file_content is None:
                continue

            # Create unique filename in ZIP
            safe_name = _sanitize_filename(archive_file.file_name)
            if safe_name in files_added:
                # Add ID to make unique
                safe_name = f"{archive_file.id}_{safe_name}"
            files_added.add(safe_name)

            # Determine folder based on file type
            if archive_file.file_type == "xml":
                folder = "CFDIs"
                cfdi_count += 1
            else:
                folder = "Archivos"

            zf.writestr(f"{folder}/{safe_name}", file_content)

        except Exception as e:
            logger.warning(f"Failed to add file {archive_file.id} to export: {e}")
            continue

    logger.info(f"Added {len(files_added)} files to export ({cfdi_count} CFDIs)")


def _read_file_from_storage(backend: Any, storage_key: str) -> bytes | None:
    """Read file content from storage backend.

    Args:
        backend: Storage backend instance
        storage_key: Storage key/path

    Returns:
        File bytes or None if not found
    """
    import os

    # For local storage backend
    if hasattr(backend, '_base'):
        file_path = backend._base / storage_key
        if file_path.exists():
            return file_path.read_bytes()

    # For object storage backend (S3)
    if hasattr(backend, '_client'):
        try:
            import boto3
            response = backend._client.get_object(
                Bucket=backend._container,
                Key=storage_key,
            )
            return response['Body'].read()
        except Exception as e:
            logger.warning(f"Failed to read from object storage: {e}")
            return None

    return None


def _sanitize_filename(filename: str) -> str:
    """Make a filename safe for ZIP storage.

    Args:
        filename: Original filename

    Returns:
        Sanitized filename
    """
    import re

    # Remove path separators
    filename = filename.replace("/", "_").replace("\\", "_")
    # Remove other unsafe characters
    filename = re.sub(r"[^a-zA-Z0-9._\-]", "_", filename)
    # Collapse multiple underscores
    filename = re.sub(r"_+", "_", filename)
    return filename


def _upload_export(tmp_zip_path: str, job_id: int, company_id: int) -> str:
    """Upload ZIP to storage and return download URL.

    Args:
        tmp_zip_path: Path to the ZIP file
        job_id: Export job ID
        company_id: Company ID

    Returns:
        Download URL for the uploaded file
    """
    from packages.modules.archive.service.storage_backend import get_storage_backend
    import uuid

    backend = get_storage_backend()

    # Generate storage key
    timestamp = datetime.now().strftime("%Y/%m")
    unique_id = uuid.uuid4().hex[:8]
    filename = f"export_{job_id}_{unique_id}.zip"
    folder_hint = f"{timestamp}/exports"

    # Read ZIP file
    with open(tmp_zip_path, "rb") as f:
        zip_bytes = f.read()

    # Upload to storage
    result = backend.save_bytes(
        company_id=company_id,
        original_filename=filename,
        file_bytes=zip_bytes,
        folder_hint=folder_hint,
        filename_hint=f"export_{job_id}",
    )

    storage_key = result["storage_key"]

    # Generate download URL based on backend type
    if hasattr(backend, '_base'):
        # Local storage - return a relative path that can be served by the API
        return f"/api/admin/export/{job_id}/download/file?storage_key={storage_key}"
    else:
        # Object storage - generate presigned URL
        if hasattr(backend, '_client'):
            try:
                url = backend._client.generate_presigned_url(
                    'get_object',
                    Params={'Bucket': backend._container, 'Key': storage_key},
                    ExpiresIn=7 * 24 * 60 * 60,  # 7 days
                )
                return url
            except Exception as e:
                logger.warning(f"Failed to generate presigned URL: {e}")
                # Fallback to API endpoint
                return f"/api/admin/export/{job_id}/download/file?storage_key={storage_key}"

    return f"/api/admin/export/{job_id}/download/file?storage_key={storage_key}"


def _generate_readme_html(company_name: str) -> str:
    """Generate README HTML with export instructions.

    Args:
        company_name: Company name for display

    Returns:
        HTML content
    """
    from datetime import datetime

    export_date = datetime.now().strftime("%Y-%m-%d %H:%M")

    return f"""<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <title>Exportacion de Datos - {company_name}</title>
    <style>
        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            max-width: 800px;
            margin: 40px auto;
            padding: 20px;
            background: #f5f5f5;
            color: #333;
        }}
        h1 {{
            color: #1a365d;
            border-bottom: 2px solid #1a365d;
            padding-bottom: 10px;
        }}
        h2 {{
            color: #2d3748;
            margin-top: 30px;
        }}
        .info-box {{
            background: white;
            border-left: 4px solid #4472C4;
            padding: 15px;
            margin: 20px 0;
        }}
        .folder-list {{
            background: white;
            padding: 20px;
            border-radius: 8px;
        }}
        .folder {{
            margin: 10px 0;
            padding: 10px;
            background: #edf2f7;
            border-radius: 4px;
        }}
        .folder-name {{
            font-weight: bold;
            color: #1a365d;
        }}
        code {{
            background: #edf2f7;
            padding: 2px 6px;
            border-radius: 3px;
        }}
    </style>
</head>
<body>
    <h1>Exportacion de Datos</h1>

    <div class="info-box">
        <strong>Empresa:</strong> {company_name}<br>
        <strong>Fecha de exportacion:</strong> {export_date}
    </div>

    <h2>Contenido del Archivo</h2>

    <div class="folder-list">
        <div class="folder">
            <span class="folder-name">Excel_Reports/</span><br>
            Reportes en formato Excel para analisis contable.
            <ul>
                <li><code>Gastos.xlsx</code> - Lista de gastos</li>
                <li><code>Categorias.xlsx</code> - Categorias contables</li>
                <li><code>Proveedores.xlsx</code> - Resumen de proveedores</li>
                <li><code>Auditoria.xlsx</code> - Registro de auditoria</li>
            </ul>
        </div>

        <div class="folder">
            <span class="folder-name">offline_viewer/</span><br>
            Visor HTML independiente. Abra <code>index.html</code> en cualquier navegador.
        </div>

        <div class="folder">
            <span class="folder-name">CFDIs/</span><br>
            Comprobantes fiscales digitales (XML/PDF).
        </div>

        <div class="folder">
            <span class="folder-name">Archivos/</span><br>
            Documentos de respaldo (recibos, facturas, etc.).
        </div>
    </div>

    <h2>Como Usar</h2>

    <ol>
        <li>Los archivos Excel se pueden abrir en Microsoft Excel, LibreOffice o Google Sheets.</li>
        <li>El visor offline funciona sin conexion a internet. Simplemente abra <code>offline_viewer/index.html</code>.</li>
        <li>Los CFDIs son archivos XML que cumplen con el estandar SAT de Mexico.</li>
    </ol>

    <h2>Soporte</h2>

    <p>Para consultas sobre esta exportacion, contacte al administrador de su empresa.</p>
</body>
</html>"""