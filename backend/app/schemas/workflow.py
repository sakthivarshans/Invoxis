from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field

from app.schemas.common import (DecimalStr, ORMModel, ProcessingStatus, ReviewAction, ReviewStatus)


class DocumentRead(ORMModel):
    id: str
    original_filename: str
    size_bytes: int
    page_count: int | None
    is_encrypted: bool
    status: ProcessingStatus
    error_code: str | None
    error_message: str | None
    invoice_id: str | None = None
    created_at: datetime
    updated_at: datetime


class JobRead(ORMModel):
    id: str
    status: ProcessingStatus
    attempt: int
    error_code: str | None
    error_message: str | None
    created_at: datetime
    started_at: datetime | None
    finished_at: datetime | None


class DocumentDetail(DocumentRead):
    jobs: list[JobRead] = []


class DocumentStatus(BaseModel):
    document_id: str
    invoice_id: str | None
    status: ProcessingStatus
    error_code: str | None
    error_message: str | None
    attempt: int | None


class UploadItemResult(BaseModel):
    filename: str
    accepted: bool
    document_id: str | None = None
    invoice_id: str | None = None
    status: ProcessingStatus | None = None
    error_code: str | None = None
    error_message: str | None = None


class UploadResponse(BaseModel):
    results: list[UploadItemResult]


class ReviewRequest(BaseModel):
    action: ReviewAction
    comment: str | None = Field(None, max_length=2000)


class ValidateRequest(BaseModel):
    tolerance: Decimal | None = Field(None, ge=0, le=Decimal("1000"))
    detect_duplicates: bool | None = None


class ValidationResultRead(BaseModel):
    invoice_id: str
    validation_status: str
    issue_count: int
    critical_count: int
    warning_count: int
    needs_verification_count: int
    issues: list["ValidationIssueReadRef"]


from app.schemas.invoice import ValidationIssueRead as ValidationIssueReadRef  # noqa: E402

ValidationResultRead.model_rebuild()


class AuditEventRead(ORMModel):
    id: str
    created_at: datetime
    action: str
    category: str
    invoice_id: str | None
    invoice_number: str | None
    actor: str
    description: str
    details: dict | None


class ExtractionRead(BaseModel):
    invoice_id: str
    document_id: str | None
    run_number: int | None
    model: str | None
    input_mode: str | None
    pages_sent: int | None
    extracted_at: datetime | None
    warnings: list | None
    field_warnings: dict | None
    field_evidence: dict | None
    raw_output: dict | None


class SummaryReport(BaseModel):
    total_invoices: int
    by_processing_status: dict[str, int]
    by_validation_status: dict[str, int]
    by_review_status: dict[str, int]
    totals_by_currency: dict[str, DecimalStr]
    spend_by_vendor: list[dict]
    needs_attention: int


class ValidationReport(BaseModel):
    total_invoices: int
    passed: int
    warning_invoices: int
    critical_invoices: int
    total_issues: int
    issues_by_rule: dict[str, int]
    issues_by_severity: dict[str, int]
