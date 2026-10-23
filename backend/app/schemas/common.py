from datetime import datetime
from decimal import Decimal
from typing import Annotated, Generic, Literal, TypeVar

from pydantic import BaseModel, ConfigDict, Field, PlainSerializer

T = TypeVar("T")

# Decimals travel as exact strings in JSON ("1234.50"); the frontend maps them to numbers for display.
DecimalStr = Annotated[Decimal, PlainSerializer(lambda d: format(d, "f"), return_type=str, when_used="json")]

ProcessingStatus = Literal["queued", "processing", "completed", "needs_review", "failed"]
ValidationStatus = Literal["valid", "warning", "critical", "unvalidated"]
ReviewStatus = Literal["pending", "in_review", "approved", "rejected", "returned_for_correction"]
ReviewAction = Literal["marked_in_review", "approved", "rejected", "returned_for_correction", "note_added"]
Severity = Literal["critical", "warning", "info"]


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    page_size: int


class PageParams(BaseModel):
    page: int = Field(1, ge=1)
    page_size: int = Field(25, ge=1, le=200)


class ErrorBody(BaseModel):
    code: str
    message: str
    details: list[dict] | dict | None = None
    request_id: str | None = None


class ErrorResponse(BaseModel):
    error: ErrorBody


class UTCModel(ORMModel):
    created_at: datetime
