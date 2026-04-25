"""Module gating dependency.

Each add-on module keeps its own FastAPI router under
``packages/modules/<name>/``. To keep those routers fully contained — so a
company that has not installed the add-on cannot reach any of its endpoints —
every add-on router declares its company-setup flag and uses ``require_module``
as a router-level dependency.

Usage::

    from packages.core.platform.module_gate import require_module

    router = APIRouter(
        prefix="/time",
        dependencies=[Depends(require_module("time_allocation"))],
    )

The dependency expects a path param named ``company_id``. If the module flag
is off for that company it raises HTTP 404 (we hide the fact that the route
exists rather than 403, so uninstalled add-ons are indistinguishable from
non-existent endpoints).

The mapping of module_key → CompanySetup column lives here so there is a single
source of truth; ``web/modules/my-work/moduleRegistry.ts`` uses the same keys.
"""
from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

from apps.api.deps import get_db
from packages.core.platform.models_company_setup import CompanySetup


MODULE_FLAG_COLUMNS: dict[str, str] = {
    "expenses":             "expenses_module_enabled",
    "time_allocation":      "time_allocation_module_enabled",
    "subcontractor":        "subcontractor_module_enabled",
    "approvals":            "approvals_module_enabled",
    "accounting":           "accounting_module_enabled",
    "archive":              "archive_module_enabled",
    "purchase_requests":    "purchase_requests_module_enabled",
    "amex_reconciliation":  "amex_reconciliation_module_enabled",
}


def require_module(module_key: str):
    """Factory: returns a FastAPI dependency that gates on the given module.

    The dependency inspects the request's ``company_id`` path param and
    checks the corresponding column on ``company_setup``. If the company has
    not installed the module, raises 404.
    """
    if module_key not in MODULE_FLAG_COLUMNS:
        raise ValueError(f"Unknown module_key: {module_key}")
    column = MODULE_FLAG_COLUMNS[module_key]

    def _dep(request: Request, db: Session = Depends(get_db)) -> None:
        raw = request.path_params.get("company_id")
        if raw is None:
            # Router misuse — better to fail loudly than silently allow.
            raise HTTPException(status_code=500, detail="module gate needs company_id path param")
        try:
            company_id = int(raw)
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail="invalid company_id")

        setup = (
            db.query(CompanySetup)
            .filter(CompanySetup.company_id == company_id)
            .first()
        )
        # Treat missing setup as "nothing enabled" — safer default.
        enabled = bool(getattr(setup, column, False)) if setup else False
        if not enabled:
            raise HTTPException(status_code=404, detail=f"module '{module_key}' not installed")

    return _dep
