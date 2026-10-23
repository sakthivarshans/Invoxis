from collections.abc import Iterator
from pathlib import Path

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine, make_url
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import BACKEND_DIR, Settings, get_settings


class Base(DeclarativeBase):
    pass


def _normalise_url(url: str) -> str:
    """Resolve relative sqlite paths against backend/ so the DB location doesn't depend on CWD."""
    u = make_url(url)
    if u.drivername.startswith("sqlite") and u.database and u.database != ":memory:":
        p = Path(u.database)
        if not p.is_absolute():
            p = (BACKEND_DIR / p).resolve()
        p.parent.mkdir(parents=True, exist_ok=True)
        u = u.set(database=str(p))
    return u.render_as_string(hide_password=False)


def make_engine(settings: Settings | None = None, url: str | None = None) -> Engine:
    settings = settings or get_settings()
    url = _normalise_url(url or settings.database_url)
    kwargs: dict = {}
    if url.startswith("sqlite"):
        kwargs["connect_args"] = {"check_same_thread": False, "timeout": 30}
        if ":memory:" in url:
            from sqlalchemy.pool import StaticPool
            kwargs["poolclass"] = StaticPool
    engine = create_engine(url, **kwargs)
    if url.startswith("sqlite"):
        @event.listens_for(engine, "connect")
        def _pragmas(dbapi_conn, _):  # enforce FKs, better concurrency with a worker thread
            cur = dbapi_conn.cursor()
            cur.execute("PRAGMA foreign_keys=ON")
            cur.execute("PRAGMA journal_mode=WAL")
            cur.close()
    return engine


_engine: Engine | None = None
_SessionLocal: sessionmaker[Session] | None = None


def init_engine(engine: Engine | None = None) -> Engine:
    global _engine, _SessionLocal
    _engine = engine or make_engine()
    _SessionLocal = sessionmaker(bind=_engine, expire_on_commit=False, autoflush=False)
    return _engine


def get_engine() -> Engine:
    if _engine is None:
        init_engine()
    assert _engine is not None
    return _engine


def session_factory() -> sessionmaker[Session]:
    if _SessionLocal is None:
        init_engine()
    assert _SessionLocal is not None
    return _SessionLocal


def get_db() -> Iterator[Session]:
    """FastAPI dependency. One transaction per request: commit on success, rollback on error."""
    db = session_factory()()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def create_all() -> None:
    from app.db import models  # noqa: F401  (register tables)
    Base.metadata.create_all(get_engine())
