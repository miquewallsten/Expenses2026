from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from apps.api.auth import get_current_user, require_same_company
from apps.api.deps import get_db
from packages.core.platform.models_user import User
from packages.core.config_engine.schemas.setup_session import SetupSessionCreate, SetupSessionRead
from packages.core.config_engine.schemas.setup_artifact import SetupArtifactCreate, SetupArtifactRead
from packages.core.config_engine.schemas.setup_inference import SetupInferenceRead
from packages.core.config_engine.schemas.setup_draft import SetupDraftRead
from packages.core.config_engine.schemas.config_version import ConfigVersionRead
from packages.core.config_engine.service.setup_service import advance_setup_stage, create_setup_session, get_setup_session
from packages.core.config_engine.service.artifact_service import create_artifact, list_artifacts
from packages.core.config_engine.service.inference_service import create_inference, list_inferences
from packages.core.config_engine.service.session_inference_service import run_setup_session_inference
from packages.core.config_engine.service.draft_service import approve_draft, generate_draft_from_inference, list_drafts
from packages.core.config_engine.service.config_service import get_latest_config_by_type, list_config_versions, publish_draft


class AdvanceStageRequest(BaseModel):
    next_stage: str


class CreateInferenceRequest(BaseModel):
    inference_type: str
    result_text: str


class RunInferenceRequest(BaseModel):
    inference_type: str


class GenerateDraftRequest(BaseModel):
    draft_type: str

router = APIRouter(prefix="/setup-sessions", tags=["setup-sessions"])


@router.post("/", response_model=SetupSessionRead)
def create_setup_session_route(payload: SetupSessionCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    require_same_company(payload.company_id, current_user)
    return create_setup_session(db, payload)


@router.get("/{session_id}", response_model=SetupSessionRead)
def get_setup_session_route(session_id: int, db: Session = Depends(get_db)):
    session = get_setup_session(db, session_id)

    if not session:
        raise HTTPException(status_code=404, detail="Setup session not found")

    return session


@router.post("/{session_id}/advance", response_model=SetupSessionRead)
def advance_setup_stage_route(session_id: int, payload: AdvanceStageRequest, db: Session = Depends(get_db)):
    try:
        session = advance_setup_stage(db, session_id, payload.next_stage)

        if not session:
            raise HTTPException(status_code=404, detail="Setup session not found")

        return session
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/setup-artifacts/", response_model=SetupArtifactRead, tags=["setup-artifacts"])
def create_artifact_route(payload: SetupArtifactCreate, db: Session = Depends(get_db)):
    try:
        return create_artifact(db, payload)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{session_id}/artifacts", response_model=list[SetupArtifactRead])
def list_artifacts_route(session_id: int, db: Session = Depends(get_db)):
    return list_artifacts(db, session_id)


@router.post("/{session_id}/inferences", response_model=SetupInferenceRead)
def create_inference_route(session_id: int, payload: CreateInferenceRequest, db: Session = Depends(get_db)):
    try:
        return create_inference(db, session_id, payload.inference_type, payload.result_text)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{session_id}/inferences", response_model=list[SetupInferenceRead])
def list_inferences_route(session_id: int, db: Session = Depends(get_db)):
    return list_inferences(db, session_id)


@router.post("/{session_id}/run-inference")
def run_inference_route(session_id: int, payload: RunInferenceRequest, db: Session = Depends(get_db)):
    try:
        result = run_setup_session_inference(db, session_id, payload.inference_type)

        if result is None:
            raise HTTPException(status_code=404, detail="Setup session not found")

        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{session_id}/generate-draft", response_model=SetupDraftRead)
def generate_draft_route(session_id: int, payload: GenerateDraftRequest, db: Session = Depends(get_db)):
    result = generate_draft_from_inference(db, session_id, payload.draft_type)

    if result is None:
        raise HTTPException(status_code=404, detail="No inference found for setup session")

    return result


@router.post("/setup-drafts/{draft_id}/approve", response_model=SetupDraftRead)
def approve_draft_route(draft_id: int, db: Session = Depends(get_db)):
    result = approve_draft(db, draft_id)

    if result is None:
        raise HTTPException(status_code=404, detail="Setup draft not found")

    return result


@router.get("/{session_id}/drafts", response_model=list[SetupDraftRead])
def list_drafts_route(session_id: int, db: Session = Depends(get_db)):
    return list_drafts(db, session_id)


@router.post("/setup-drafts/{draft_id}/publish", response_model=ConfigVersionRead)
def publish_draft_route(draft_id: int, db: Session = Depends(get_db)):
    try:
        result = publish_draft(db, draft_id)

        if result is None:
            raise HTTPException(status_code=404, detail="Setup draft not found")

        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{session_id}/configs", response_model=list[ConfigVersionRead])
def list_config_versions_route(session_id: int, db: Session = Depends(get_db)):
    return list_config_versions(db, session_id)


@router.get("/{session_id}/configs/{config_type}", response_model=ConfigVersionRead)
def get_latest_config_by_type_route(session_id: int, config_type: str, db: Session = Depends(get_db)):
    result = get_latest_config_by_type(db, session_id, config_type)

    if result is None:
        raise HTTPException(status_code=404, detail="Config not found")

    return result


@router.get("/configs", response_model=list[ConfigVersionRead])
def list_all_configs_route(setup_session_id: int | None = None, db: Session = Depends(get_db)):
    if setup_session_id is not None:
        return list_config_versions(db, setup_session_id)
    return []
