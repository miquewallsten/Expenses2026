from apps.api.db import SessionLocal
from packages.core.platform.models_channels import CompanyChannelConfig
from packages.core.platform.models_auth_settings import CompanyAuthSettings

def patch_company_1():
    db = SessionLocal()
    try:
        cid = 1
        if not db.query(CompanyChannelConfig).filter_by(company_id=cid).first():
            db.add(CompanyChannelConfig(company_id=cid))
            print("Added CompanyChannelConfig for company 1")
        if not db.query(CompanyAuthSettings).filter_by(company_id=cid).first():
            db.add(CompanyAuthSettings(company_id=cid))
            print("Added CompanyAuthSettings for company 1")
        db.commit()
    finally:
        db.close()

if __name__ == "__main__":
    patch_company_1()
