"""Adapter implementations and the IntegrationAdapter protocol (Phase 4.3)."""
from packages.modules.integrations.service.adapters.protocol import (
    AdapterResult,
    IntegrationAdapter,
)
from packages.modules.integrations.service.adapters.aspel import AspelAdapter
from packages.modules.integrations.service.adapters.bank_statement import (
    BankStatementAdapter,
)
from packages.modules.integrations.service.adapters.contpaqi import ContpaqiAdapter
from packages.modules.integrations.service.adapters.generic_csv import (
    GenericCsvJsonAdapter,
)
from packages.modules.integrations.service.adapters.hris_csv import HrisCsvAdapter
from packages.modules.integrations.service.adapters.netsuite import NetSuiteAdapter
from packages.modules.integrations.service.adapters.oracle_jde import OracleJDEAdapter
from packages.modules.integrations.service.adapters.quickbooks import QuickBooksAdapter
from packages.modules.integrations.service.adapters.sap import SapAdapter
from packages.modules.integrations.service.adapters.xero import XeroAdapter
from packages.modules.integrations.service.adapters.registry import (
    ADAPTER_REGISTRY,
    get_adapter,
)

__all__ = [
    "AdapterResult",
    "IntegrationAdapter",
    "AspelAdapter",
    "BankStatementAdapter",
    "ContpaqiAdapter",
    "GenericCsvJsonAdapter",
    "HrisCsvAdapter",
    "NetSuiteAdapter",
    "OracleJDEAdapter",
    "QuickBooksAdapter",
    "SapAdapter",
    "XeroAdapter",
    "ADAPTER_REGISTRY",
    "get_adapter",
]
