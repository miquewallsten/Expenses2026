from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from apps.api.deps import get_db
from packages.modules.accounting.schemas.export_config import (
    ExportConfigRead,
    ExportConfigUpdate,
)
from packages.modules.accounting.service.export_bundle_config_service import (
    get_or_create_export_bundle_config,
    upsert_export_bundle_config,
)

router = APIRouter(prefix="/admin/export-config", tags=["admin"])


@router.get("/{company_id}", response_model=ExportConfigRead)
def get_export_config_route(company_id: int, db: Session = Depends(get_db)):
    return get_or_create_export_bundle_config(db, company_id)


@router.put("/{company_id}", response_model=ExportConfigRead)
def upsert_export_config_route(
    company_id: int,
    data: ExportConfigUpdate,
    db: Session = Depends(get_db),
):
    return upsert_export_bundle_config(db, company_id, data)


# ── DEV MANUAL TESTS ──────────────────────────────────────────────────────────
#
# 1. Get export config (auto-creates defaults on first call):
#
#    curl http://127.0.0.1:8000/admin/export-config/1
#
# 2. Update export config:
#
#    curl -X PUT http://127.0.0.1:8000/admin/export-config/1 \
#         -H "Content-Type: application/json" \
#         -d '{"bundle_name_pattern":"bundle_{company_id}_{date}","export_format":"json"}'
#
# 3. Build export bundle (uses the stored pattern from step 2):
#
#    curl -X POST http://127.0.0.1:8000/accounting/export-bundles/1
#
# 4. Verify portal config includes export_config:
#
#    curl http://127.0.0.1:8000/admin/portal-config/1
#    # Expect: { ..., "export_config": { "bundle_name_pattern": "...", "export_format": "json" } }
#
# ─────────────────────────────────────────────────────────────────────────────
