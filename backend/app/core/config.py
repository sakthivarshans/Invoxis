"""Application settings, loaded from environment variables / backend/.env."""
from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(BACKEND_DIR / ".env"), env_file_encoding="utf-8", extra="ignore"
    )

    app_env: Literal["development", "production", "test"] = "development"
    log_level: str = "INFO"

    database_url: str = "sqlite:///./data/invoxis.db"
    upload_dir: str = "./storage/uploads"
    max_upload_size_mb: int = Field(default=25, ge=1, le=200)
    max_pdf_pages: int = Field(default=30, ge=1, le=200)
    cors_origins: str = "http://localhost:3000"

    # Groq. No default model is hardcoded: model identifiers change, so it must be configured.
    groq_api_key: str = ""
    groq_model: str = ""                # used for text-layer PDFs (and scanned ones if no vision model is set)
    groq_vision_model: str = ""         # optional: model used for scanned/image pages; defaults to groq_model
    groq_timeout_seconds: int = Field(default=120, ge=5, le=900)
    groq_max_output_tokens: int = Field(default=4096, ge=256, le=32768)
    # "json_schema": send the JSON schema as response_format (supported on some models, e.g. Llama 4).
    # "json_object": plain JSON mode with the schema in the prompt (works on more models). Output is always
    # re-validated against the schema by Pydantic either way.
    groq_structured_mode: Literal["json_schema", "json_object"] = "json_schema"
    # Prompt / image limits (Groq vision: max images per request varies by model; ~4 MB cap for base64 images).
    groq_max_images: int = Field(default=5, ge=1, le=10)
    max_image_payload_mb: float = Field(default=3.0, gt=0.5, le=3.8)
    max_prompt_chars: int = Field(default=60000, ge=2000)
    # A page whose text layer has fewer characters than this is treated as "scanned".
    min_text_chars_per_page: int = Field(default=40, ge=0)
    render_dpi: int = Field(default=150, ge=72, le=300)

    # Validation
    rounding_tolerance: str = "0.02"
    max_plausible_amount: str = "1000000000"

    # Background jobs: "thread" (in-process pool) or "inline" (synchronous, used in tests)
    job_execution_mode: Literal["thread", "inline"] = "thread"
    job_workers: int = Field(default=2, ge=1, le=8)

    # No authentication in this version; every action is attributed to this identity.
    default_actor: str = "dev-workspace (unauthenticated)"

    @field_validator("cors_origins")
    @classmethod
    def _no_wildcard(cls, v: str) -> str:
        if "*" in v:
            raise ValueError("CORS_ORIGINS must list explicit origins; wildcard is not allowed")
        return v

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def max_upload_bytes(self) -> int:
        return self.max_upload_size_mb * 1024 * 1024

    @property
    def upload_path(self) -> Path:
        p = Path(self.upload_dir)
        return p if p.is_absolute() else (BACKEND_DIR / p).resolve()

    @property
    def extraction_configured(self) -> bool:
        return bool(self.groq_api_key.strip() and self.groq_model.strip())

    @property
    def vision_model(self) -> str:
        return self.groq_vision_model.strip() or self.groq_model.strip()


@lru_cache
def get_settings() -> Settings:
    return Settings()
