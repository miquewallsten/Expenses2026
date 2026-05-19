from pydantic_settings import BaseSettings, SettingsConfigDict
from dotenv import load_dotenv

load_dotenv()


# Known insecure dev default — must never run in production.
_DEV_AUTH_SECRET_SENTINEL = "dev-secret-change-in-production-32ch"
_PROD_ENVS = frozenset({"production", "prod", "staging"})


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "Financial Ops Platform API"
    environment: str = "development"
    debug: bool = True
    database_url: str = "postgresql://localhost/financial_ops"
    ollama_base_url: str = "http://127.0.0.1:11434"
    ollama_model: str = ""
    ollama_num_ctx: int = 32768
    cors_origins: list[str] = ["http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:3001", "http://127.0.0.1:3001"]

    # Auth — AUTH_SECRET must be explicitly set in production.
    auth_secret: str = _DEV_AUTH_SECRET_SENTINEL

    # Public-facing web URL used in outbound email links.
    web_base_url: str = "http://localhost:3000"

    @property
    def is_production(self) -> bool:
        return self.environment.lower().strip() in _PROD_ENVS

    def validate_for_production(self) -> None:
        """Fail fast if production has insecure defaults.

        Called once at application startup (apps.api.main). Keeping it
        explicit (rather than a validator) so import-time side effects
        don't crash tests running with SQLite and the dev default.
        """
        if not self.is_production:
            return
        errors: list[str] = []
        if self.auth_secret == _DEV_AUTH_SECRET_SENTINEL or not self.auth_secret:
            errors.append(
                "AUTH_SECRET is unset or uses the known dev default. "
                "Generate a secret with `openssl rand -hex 32` and set it."
            )
        if len(self.auth_secret) < 32:
            errors.append(
                f"AUTH_SECRET is too short ({len(self.auth_secret)} chars); "
                "require at least 32 characters."
            )
        if self.debug:
            errors.append("DEBUG must be false in production.")
        if errors:
            raise RuntimeError(
                "Insecure configuration for ENVIRONMENT="
                f"{self.environment!r}:\n  - " + "\n  - ".join(errors)
            )


settings = Settings()
