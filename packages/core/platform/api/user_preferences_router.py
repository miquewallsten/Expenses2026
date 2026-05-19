"""User preferences API — nav layout, UI state, etc."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from apps.api.auth import get_current_user
from apps.api.deps import get_db
from packages.core.platform.models_user import User
from packages.core.platform.models_user_preferences import UserPreferences

router = APIRouter(prefix="/user-preferences", tags=["user-preferences"])


class NavGroupIn(BaseModel):
    id: str
    name: str
    moduleIds: list[str] = []
    collapsed: bool = False


class NavLayoutIn(BaseModel):
    order: list[str] = []
    groups: list[NavGroupIn] = []
    hiddenIds: list[str] = []


class PreferencesOut(BaseModel):
    nav_layout: NavLayoutIn | None = None


@router.get("/{user_id}")
def get_preferences(user_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Get the current user's UI preferences."""
    if current_user.id != user_id:
        raise HTTPException(status_code=403, detail="Cannot access other users' preferences")

    row = db.query(UserPreferences).filter(UserPreferences.user_id == user_id).first()
    if not row:
        return {"nav_layout": None}

    import json
    try:
        data = json.loads(row.preferences_json)
    except Exception:
        data = {}

    return {"nav_layout": data.get("nav_layout")}


@router.put("/{user_id}")
def save_preferences(user_id: int, body: PreferencesOut, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Save the current user's UI preferences."""
    if current_user.id != user_id:
        raise HTTPException(status_code=403, detail="Cannot modify other users' preferences")

    import json
    nav_layout = body.nav_layout
    nav_data = {
        "order": nav_layout.order if nav_layout else [],
        "groups": [g.model_dump() for g in nav_layout.groups] if nav_layout else [],
        "hiddenIds": nav_layout.hiddenIds if nav_layout else [],
    } if nav_layout else {}

    row = db.query(UserPreferences).filter(UserPreferences.user_id == user_id).first()
    if row:
        import json as _json
        try:
            existing = _json.loads(row.preferences_json)
        except Exception:
            existing = {}
        existing["nav_layout"] = nav_data
        row.preferences_json = _json.dumps(existing)
    else:
        row = UserPreferences(user_id=user_id, preferences_json=json.dumps({"nav_layout": nav_data}))
        db.add(row)

    db.commit()
    return {"nav_layout": nav_data}
