from pydantic_settings import BaseSettings
from dotenv import load_dotenv

load_dotenv()


class Settings(BaseSettings):
    app_name: str = "Financial Ops Platform API"
    environment: str = "development"
    debug: bool = True
    database_url: str = "postgresql://localhost/financial_ops"
    ollama_base_url: str = "http://127.0.0.1:11434"
    ollama_model: str = ""

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
