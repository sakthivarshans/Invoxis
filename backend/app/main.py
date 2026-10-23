import logging
from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import documents, health, invoices, workflow
from app.core.config import Settings, get_settings
from app.core.errors import install_error_handling
from app.core.logging import configure_logging
from app.db import session as dbsession
from app.services import processing_service

log = logging.getLogger("invoxis")


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    configure_logging(settings.log_level)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        dbsession.create_all()
        settings.upload_path.mkdir(parents=True, exist_ok=True)
        n = processing_service.recover_jobs(settings)
        log.info("INVOXIS API started (jobs recovered: %s, extraction configured: %s)", n,
                 settings.extraction_configured)
        yield
        processing_service.runner.shutdown()

    app = FastAPI(title="INVOXIS AI API", version="1.0.0", lifespan=lifespan)
    app.dependency_overrides[get_settings] = lambda: settings
    install_error_handling(app)
    app.add_middleware(
        CORSMiddleware, allow_origins=settings.cors_origin_list, allow_credentials=False,
        allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"], allow_headers=["*"],
        expose_headers=["X-Request-ID", "Content-Disposition"])

    v1 = APIRouter(prefix="/api/v1")
    for r in (health.router, invoices.router, documents.router, workflow.router):
        v1.include_router(r)
    app.include_router(v1)
    return app


app = create_app()
