"""Platform-level models for multi-tenant infrastructure.

These tables are managed by Super Admin and are NOT company-scoped.
Tenant isolation is enforced via tenant_id foreign keys.
"""

from datetime import datetime
from decimal import Decimal

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint, func, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship

from apps.api.db import Base


class PlatformTenant(Base):
    """A company using the platform (tenant)."""

    __tablename__ = "platform_tenants"
    __table_args__ = (
        UniqueConstraint("slug", name="uq_platform_tenants_slug"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    slug: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    plan: Mapped[str] = mapped_column(String(32), nullable=False, default="starter")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())
    settings: Mapped[str] = mapped_column(Text, nullable=False, default="{}")  # JSON

    # Relationships
    usage_logs: Mapped[list["PlatformUsageLog"]] = relationship(back_populates="tenant")


class PlatformLLMProvider(Base):
    """LLM provider configuration (OpenAI, Anthropic, Ollama, etc.)."""

    __tablename__ = "platform_llm_providers"
    __table_args__ = (
        UniqueConstraint("name", name="uq_platform_llm_providers_name"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(64), nullable=False)
    provider_type: Mapped[str] = mapped_column(String(32), nullable=False)  # openai, anthropic, ollama
    api_key_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)
    base_url: Mapped[str | None] = mapped_column(String(255), nullable=True)
    model_name: Mapped[str] = mapped_column(String(128), nullable=False)
    cost_per_1k_tokens_input: Mapped[Decimal] = mapped_column(Numeric(10, 6), nullable=False, default=Decimal("0"))
    cost_per_1k_tokens_output: Mapped[Decimal] = mapped_column(Numeric(10, 6), nullable=False, default=Decimal("0"))
    rate_limit_rpm: Mapped[int | None] = mapped_column(Integer, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())

    # Relationships
    agent_definitions: Mapped[list["PlatformAgentDefinition"]] = relationship(back_populates="default_provider")
    usage_logs: Mapped[list["PlatformUsageLog"]] = relationship(back_populates="provider")


class PlatformAgentDefinition(Base):
    """Agent template available to tenants."""

    __tablename__ = "platform_agent_definitions"
    __table_args__ = (
        UniqueConstraint("key", name="uq_platform_agent_definitions_key"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    key: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    system_prompt: Mapped[str] = mapped_column(Text, nullable=False)
    allowed_tools: Mapped[str] = mapped_column(Text, nullable=False, default="[]")  # JSON list
    default_provider_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("platform_llm_providers.id"), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())

    # Relationships
    default_provider: Mapped["PlatformLLMProvider | None"] = relationship(back_populates="agent_definitions")


class PlatformUsageLog(Base):
    """Usage logging for billing and analytics."""

    __tablename__ = "platform_usage_logs"
    __table_args__ = (
        Index("idx_usage_logs_tenant_created", "tenant_id", "created_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(Integer, ForeignKey("platform_tenants.id"), nullable=False)
    agent_key: Mapped[str] = mapped_column(String(64), nullable=False)
    provider_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("platform_llm_providers.id"), nullable=True)
    input_tokens: Mapped[int] = mapped_column(Integer, nullable=False)
    output_tokens: Mapped[int] = mapped_column(Integer, nullable=False)
    cost_input: Mapped[Decimal] = mapped_column(Numeric(10, 6), nullable=False, default=Decimal("0"))
    cost_output: Mapped[Decimal] = mapped_column(Numeric(10, 6), nullable=False, default=Decimal("0"))
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())

    # Relationships
    tenant: Mapped["PlatformTenant"] = relationship(back_populates="usage_logs")
    provider: Mapped["PlatformLLMProvider | None"] = relationship(back_populates="usage_logs")