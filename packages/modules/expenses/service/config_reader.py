from sqlalchemy.orm import Session

from packages.core.config_engine.service.company_config_service import get_latest_config_for_company


def get_account_mapping_config(db: Session, company_id: int) -> str | None:
    config = get_latest_config_for_company(
        db,
        company_id=company_id,
        config_type="account_mapping_draft",
    )

    if not config:
        return None

    return config.content_text
