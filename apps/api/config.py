from pydantic import BaseModel


class Settings(BaseModel):
    app_name: str = "Financial Ops Platform API"
    environment: str = "development"
    debug: bool = True


settings = Settings()