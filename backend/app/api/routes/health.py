from fastapi import APIRouter
from sqlalchemy import text

from app.api.deps import DB, SettingsDep

router = APIRouter(tags=["health"])


@router.get("/health")
def health(db: DB, settings: SettingsDep):
    try:
        db.execute(text("SELECT 1"))
        db_ok = True
    except Exception:  # noqa: BLE001 - report status only, never details
        db_ok = False
    return {
        "status": "ok" if db_ok else "degraded",
        "database": "connected" if db_ok else "unavailable",
        "extraction": {"configured": settings.extraction_configured,
                       "provider": "groq", "model": settings.groq_model or None,
                       "vision_model": settings.vision_model or None},
        "environment": settings.app_env,
    }
