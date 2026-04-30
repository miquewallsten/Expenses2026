from typing import Any

from pydantic import BaseModel


class ContextUpdateRequest(BaseModel):
    module: str
    context_data: dict[str, Any] | None = None


class ContextUpdateResponse(BaseModel):
    module: str
    copilot_suggestions: list[dict[str, Any]]


class ActionRequest(BaseModel):
    action_id: str
    module: str
    payload: dict[str, Any] | None = None
    context: dict[str, Any] | None = None


class ActionError(BaseModel):
    code: str
    message: str
    retryable: bool = False


class ActionResponse(BaseModel):
    success: bool
    data: dict[str, Any] | None = None
    error: ActionError | None = None
