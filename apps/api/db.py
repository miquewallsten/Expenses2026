from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase

from apps.api.config import settings

DATABASE_URL = settings.database_url

# Create engine with appropriate settings based on database type
if DATABASE_URL.startswith("sqlite"):
    # SQLite doesn't support pool_size and max_overflow
    engine = create_engine(
        DATABASE_URL,
        pool_pre_ping=True,
    )
else:
    # PostgreSQL and other databases support connection pooling
    engine = create_engine(
        DATABASE_URL,
        pool_size=10,
        max_overflow=20,
        pool_pre_ping=True,
    )

SessionLocal = sessionmaker(bind=engine)


class Base(DeclarativeBase):
    pass
