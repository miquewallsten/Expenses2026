from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase

from apps.api.config import settings

DATABASE_URL = settings.database_url

engine = create_engine(
    DATABASE_URL,
    pool_size=10,
    max_overflow=20,
    pool_pre_ping=True,
)

SessionLocal = sessionmaker(bind=engine)


class Base(DeclarativeBase):
    pass
