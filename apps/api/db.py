from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase

# DEV NOTE — schema migrations
# `Base.metadata.create_all(engine)` (called in main.py) only creates *missing
# tables*.  It does NOT add new columns to existing tables.
# When you add a column to an ORM model during development, the local app.db
# will be out of sync.  Fix it with either:
#   a) Delete app.db and restart — create_all rebuilds from scratch.
#   b) Apply the column manually:
#        sqlite3 app.db "ALTER TABLE <table> ADD COLUMN <col> <type> DEFAULT <val>"
# Option (b) is preferred when you need to keep existing seed data.

DATABASE_URL = "sqlite:///./app.db"


engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},  # needed for SQLite
)

SessionLocal = sessionmaker(bind=engine)


class Base(DeclarativeBase):
    pass