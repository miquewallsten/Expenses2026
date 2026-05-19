"""Module gating dependency.

Each add-on module keeps its own FastAPI router under
``packages/modules/<name>/``. To keep those routers fully contained — so a
company that has not installed the add-on cannot reach any of its endpoints —
every add-on router declares its company-setup flag and uses ``require_module``
as a router-level dependency.

The dependency resolves ``company_id`` from:
  1. Path parameter (e.g. /time/{company_id}/entries)
  2. Query parameter (e.g. ?company_id=1)
  3. Auth user's company_id (fallback for admin-only routes)
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

    Resolves company_id from path params, query params, or the current user.
    For admin-only routes without company_id in the path, uses the X-User-Id
    header to look up the user's company.
    """
    if module_key not in MODULE_FLAG_COLUMNS:
        raise ValueError(f"Unknown module_key: {module_key}")
    column = MODULE_FLAG_COLUMNS[module_key]

    def _dep(request: Request, db: Session = Depends(get_db)) -> None:
        company_id: int | None = None

        # 1. Path param
        raw = request.path_params.get("company_id")
        if raw is not None:
            try:
                company_id = int(raw)
            except (TypeError, ValueError):
                pass

        # 2. Query param
        if company_id is None:
            raw = request.query_params.get("company_id")
            if raw is not None:
                try:
                    company_id = int(raw)
                except (TypeError, ValueError):
                    pass

        # 3. X-User-Id header (dev bypass) or Bearer token subject
        if company_id is None:
            from packages.core.platform.models_user import User as UserModel
            user_id = None
            uid = request.headers.get("x-user-id")
            if uid:
                try:
                    user_id = int(uid)
                except (TypeError, ValueError):
                    pass
            if user_id is None:
                auth = request.headers.get("authorization", "")
                if auth.startswith("Bearer "):
                    try:
                        import jwt
                        from apps.api.auth import _SECRET
                        payload = jwt.decode(auth[7:], _SECRET, algorithms=["HS256"], audience="financial-ops-platform")
                        user_id = int(payload.get("sub", 0))
                    except Exception:
                        pass
            if user_id is not None:
                user = db.query(UserModel).filter(UserModel.id == user_id).first()
                if user and user.company_id:
                    company_id = user.company_id

        if company_id is None:
            raise HTTPException(status_code=500, detail="module gate needs company_id")

        setup = (
            db.query(CompanySetup)
            .filter(CompanySetup.company_id == company_id)
            .first()
        )
        enabled = bool(getattr(setup, column, False)) if setup else False
        if not enabled:
            raise HTTPException(status_code=404, detail=f"module '{module_key}' not installed")

    return _dep
