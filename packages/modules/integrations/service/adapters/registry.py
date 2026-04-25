"""Vendor → adapter registry."""
from __future__ import annotations

from packages.modules.integrations.service.adapters.aspel import AspelAdapter
from packages.modules.integrations.service.adapters.contpaqi import ContpaqiAdapter
from packages.modules.integrations.service.adapters.generic_csv import (
    GenericCsvJsonAdapter,
)
from packages.modules.integrations.service.adapters.netsuite import NetSuiteAdapter
from packages.modules.integrations.service.adapters.oracle_jde import OracleJDEAdapter
from packages.modules.integrations.service.adapters.protocol import IntegrationAdapter
from packages.modules.integrations.service.adapters.quickbooks import QuickBooksAdapter
from packages.modules.integrations.service.adapters.sap import SapAdapter
from packages.modules.integrations.service.adapters.xero import XeroAdapter


ADAPTER_REGISTRY: dict[str, type[IntegrationAdapter]] = {
    "contpaqi": ContpaqiAdapter,
    "aspel": AspelAdapter,
    "sap": SapAdapter,
    "netsuite": NetSuiteAdapter,
    "oracle": OracleJDEAdapter,
    "quickbooks": QuickBooksAdapter,
    "xero": XeroAdapter,
    "custom": GenericCsvJsonAdapter,
}


def get_adapter(vendor: str) -> IntegrationAdapter | None:
    cls = ADAPTER_REGISTRY.get(vendor)
    return cls() if cls else None
