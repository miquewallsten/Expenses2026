"""Vendor → adapter registry."""
from __future__ import annotations

from packages.modules.integrations.service.adapters.aspel import AspelAdapter
from packages.modules.integrations.service.adapters.contpaqi import ContpaqiAdapter
from packages.modules.integrations.service.adapters.generic_csv import (
    GenericCsvJsonAdapter,
)
from packages.modules.integrations.service.adapters.protocol import IntegrationAdapter


ADAPTER_REGISTRY: dict[str, type[IntegrationAdapter]] = {
    "contpaqi": ContpaqiAdapter,
    "aspel": AspelAdapter,
    "custom": GenericCsvJsonAdapter,
}


def get_adapter(vendor: str) -> IntegrationAdapter | None:
    cls = ADAPTER_REGISTRY.get(vendor)
    return cls() if cls else None
