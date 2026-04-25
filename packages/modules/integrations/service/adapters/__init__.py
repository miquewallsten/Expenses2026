"""Adapter implementations and the IntegrationAdapter protocol (Phase 4.3)."""
from packages.modules.integrations.service.adapters.protocol import (
    AdapterResult,
    IntegrationAdapter,
)
from packages.modules.integrations.service.adapters.aspel import AspelAdapter
from packages.modules.integrations.service.adapters.contpaqi import ContpaqiAdapter
from packages.modules.integrations.service.adapters.generic_csv import (
    GenericCsvJsonAdapter,
)
from packages.modules.integrations.service.adapters.sap import SapAdapter
from packages.modules.integrations.service.adapters.registry import (
    ADAPTER_REGISTRY,
    get_adapter,
)

__all__ = [
    "AdapterResult",
    "IntegrationAdapter",
    "AspelAdapter",
    "ContpaqiAdapter",
    "GenericCsvJsonAdapter",
    "SapAdapter",
    "ADAPTER_REGISTRY",
    "get_adapter",
]
