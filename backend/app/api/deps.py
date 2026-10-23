from typing import Annotated

from fastapi import Depends
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.db.session import get_db

DB = Annotated[Session, Depends(get_db)]
SettingsDep = Annotated[Settings, Depends(get_settings)]


def actor_of(settings: Settings) -> str:
    """No auth in this version: all actions are attributed to a clearly-labelled service identity."""
    return settings.default_actor
