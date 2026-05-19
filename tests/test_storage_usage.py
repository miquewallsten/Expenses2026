"""Tests for StorageUsage model — billing metrics tracking."""

from datetime import date, datetime

import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from packages.core.platform.models import Company
from packages.core.platform.models_storage_usage import StorageUsage


@pytest.fixture
def test_company(db_session: Session) -> Company:
    """Create a test company for storage usage tests."""
    company = Company(name="Storage Test Co", slug="storage-test")
    db_session.add(company)
    db_session.commit()
    db_session.refresh(company)
    return company


def test_storage_usage_creation(db_session: Session, test_company: Company) -> None:
    """Test creating a basic storage usage record."""
    usage = StorageUsage(
        company_id=test_company.id,
        period_start=date(2024, 1, 1),
        period_end=date(2024, 1, 31),
        files_bytes=5_000_000_000,  # 5 GB
        db_bytes=1_000_000_000,  # 1 GB
        total_bytes=6_000_000_000,  # 6 GB
    )
    db_session.add(usage)
    db_session.commit()
    db_session.refresh(usage)

    assert usage.id is not None
    assert usage.company_id == test_company.id
    assert usage.period_start == date(2024, 1, 1)
    assert usage.period_end == date(2024, 1, 31)
    assert usage.files_bytes == 5_000_000_000
    assert usage.db_bytes == 1_000_000_000
    assert usage.total_bytes == 6_000_000_000
    assert usage.included_bytes == 10_000_000_000  # Default 10 GB
    assert usage.overage_bytes == 0
    assert usage.billed is False
    assert usage.billed_at is None
    assert usage.calculated_at is not None


def test_storage_usage_overage_calculation(db_session: Session, test_company: Company) -> None:
    """Test overage calculation when usage exceeds included quota."""
    usage = StorageUsage(
        company_id=test_company.id,
        period_start=date(2024, 2, 1),
        period_end=date(2024, 2, 29),
        files_bytes=8_000_000_000,  # 8 GB
        db_bytes=5_000_000_000,  # 5 GB
        total_bytes=13_000_000_000,  # 13 GB
        included_bytes=10_000_000_000,  # 10 GB included
        overage_bytes=3_000_000_000,  # 3 GB overage
    )
    db_session.add(usage)
    db_session.commit()
    db_session.refresh(usage)

    assert usage.total_bytes == 13_000_000_000
    assert usage.overage_bytes == 3_000_000_000
    assert usage.overage_bytes == usage.total_bytes - usage.included_bytes


def test_storage_usage_unique_period(db_session: Session, test_company: Company) -> None:
    """Test that only one storage usage record can exist per company per period."""
    # First record
    usage1 = StorageUsage(
        company_id=test_company.id,
        period_start=date(2024, 3, 1),
        period_end=date(2024, 3, 31),
        files_bytes=1_000_000_000,
        db_bytes=500_000_000,
        total_bytes=1_500_000_000,
    )
    db_session.add(usage1)
    db_session.commit()

    # Attempt to create duplicate record for same period
    usage2 = StorageUsage(
        company_id=test_company.id,
        period_start=date(2024, 3, 1),
        period_end=date(2024, 3, 31),
        files_bytes=2_000_000_000,
        db_bytes=1_000_000_000,
        total_bytes=3_000_000_000,
    )
    db_session.add(usage2)

    # Should raise IntegrityError due to unique constraint
    with pytest.raises(IntegrityError):
        db_session.commit()


def test_storage_usage_different_companies_same_period(db_session: Session) -> None:
    """Test that different companies can have usage records for the same period."""
    # Create two companies
    company1 = Company(name="Company One", slug="co-one-storage")
    company2 = Company(name="Company Two", slug="co-two-storage")
    db_session.add(company1)
    db_session.add(company2)
    db_session.commit()
    db_session.refresh(company1)
    db_session.refresh(company2)

    # Same period for different companies
    period_start = date(2024, 4, 1)
    period_end = date(2024, 4, 30)

    usage1 = StorageUsage(
        company_id=company1.id,
        period_start=period_start,
        period_end=period_end,
        files_bytes=1_000_000_000,
        db_bytes=500_000_000,
        total_bytes=1_500_000_000,
    )
    usage2 = StorageUsage(
        company_id=company2.id,
        period_start=period_start,
        period_end=period_end,
        files_bytes=2_000_000_000,
        db_bytes=1_000_000_000,
        total_bytes=3_000_000_000,
    )
    db_session.add(usage1)
    db_session.add(usage2)
    db_session.commit()

    # Both records should exist
    assert usage1.id is not None
    assert usage2.id is not None
    assert usage1.id != usage2.id


def test_storage_usage_billing_status(db_session: Session, test_company: Company) -> None:
    """Test billing status tracking on storage usage records."""
    usage = StorageUsage(
        company_id=test_company.id,
        period_start=date(2024, 5, 1),
        period_end=date(2024, 5, 31),
        files_bytes=1_000_000_000,
        db_bytes=500_000_000,
        total_bytes=1_500_000_000,
        billed=True,
        billed_at=datetime(2024, 6, 1, 12, 0, 0),
    )
    db_session.add(usage)
    db_session.commit()
    db_session.refresh(usage)

    assert usage.billed is True
    assert usage.billed_at == datetime(2024, 6, 1, 12, 0, 0)


def test_storage_usage_default_values(db_session: Session, test_company: Company) -> None:
    """Test that default values are set correctly."""
    usage = StorageUsage(
        company_id=test_company.id,
        period_start=date(2024, 6, 1),
        period_end=date(2024, 6, 30),
    )
    db_session.add(usage)
    db_session.commit()
    db_session.refresh(usage)

    # Check defaults
    assert usage.files_bytes == 0
    assert usage.db_bytes == 0
    assert usage.total_bytes == 0
    assert usage.included_bytes == 10_000_000_000  # 10 GB default
    assert usage.overage_bytes == 0
    assert usage.billed is False
    assert usage.billed_at is None