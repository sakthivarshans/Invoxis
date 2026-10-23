"""SQLAlchemy models. Money/quantity values are Decimal in Python and scaled integers in the DB."""
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy import (JSON, BigInteger, Boolean, Date, DateTime, ForeignKey, Index, Integer,
                        String, Text, UniqueConstraint)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import TypeDecorator

from app.db.session import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def new_id(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:12]}"


class UTCDateTime(TypeDecorator):
    """Always store naive-UTC, always return tz-aware UTC (SQLite drops tzinfo)."""
    impl = DateTime
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        if value.tzinfo is not None:
            value = value.astimezone(timezone.utc).replace(tzinfo=None)
        return value

    def process_result_value(self, value, dialect):
        return None if value is None else value.replace(tzinfo=timezone.utc)


class ScaledDecimal(TypeDecorator):
    """Exact Decimal stored as BigInteger * 10**scale. Portable and sortable; no float involved.

    Swap for Numeric(precision, scale) on PostgreSQL if desired; Python-side values are unchanged.
    """
    impl = BigInteger
    cache_ok = True

    def __init__(self, scale: int = 4):
        super().__init__()
        self.scale = scale

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        return int((Decimal(value) * (Decimal(10) ** self.scale)).to_integral_value())

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        return (Decimal(value) / (Decimal(10) ** self.scale)).quantize(Decimal(10) ** -self.scale)


MONEY = lambda: ScaledDecimal(4)      # noqa: E731
QTY = lambda: ScaledDecimal(6)        # noqa: E731


class SourceDocument(Base):
    __tablename__ = "source_documents"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=lambda: new_id("doc"))
    original_filename: Mapped[str] = mapped_column(String(255))
    stored_filename: Mapped[str] = mapped_column(String(80), unique=True)  # server-generated
    mime_type: Mapped[str] = mapped_column(String(100), default="application/pdf")
    size_bytes: Mapped[int] = mapped_column(Integer)
    sha256: Mapped[str] = mapped_column(String(64), index=True)
    page_count: Mapped[int | None] = mapped_column(Integer)
    is_encrypted: Mapped[bool] = mapped_column(Boolean, default=False)
    status: Mapped[str] = mapped_column(String(20), default="queued", index=True)
    error_code: Mapped[str | None] = mapped_column(String(60))
    error_message: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow, onupdate=utcnow)

    invoice: Mapped["Invoice | None"] = relationship(back_populates="document", uselist=False)
    jobs: Mapped[list["ProcessingJob"]] = relationship(
        back_populates="document", order_by="ProcessingJob.created_at")


class ProcessingJob(Base):
    __tablename__ = "processing_jobs"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=lambda: new_id("job"))
    document_id: Mapped[str] = mapped_column(ForeignKey("source_documents.id"), index=True)
    status: Mapped[str] = mapped_column(String(20), default="queued", index=True)
    attempt: Mapped[int] = mapped_column(Integer, default=1)
    error_code: Mapped[str | None] = mapped_column(String(60))
    error_message: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    started_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    finished_at: Mapped[datetime | None] = mapped_column(UTCDateTime)

    document: Mapped[SourceDocument] = relationship(back_populates="jobs")


class Invoice(Base):
    __tablename__ = "invoices"
    __table_args__ = (Index("ix_invoice_vendor_number", "vendor_name", "invoice_number"),)

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=lambda: new_id("inv"))
    document_id: Mapped[str | None] = mapped_column(
        ForeignKey("source_documents.id"), unique=True, index=True)  # 1 invoice per document
    version: Mapped[int] = mapped_column(Integer, default=1)  # optimistic concurrency

    processing_status: Mapped[str] = mapped_column(String(20), default="queued", index=True)
    validation_status: Mapped[str] = mapped_column(String(20), default="unvalidated", index=True)
    review_status: Mapped[str] = mapped_column(String(30), default="pending", index=True)
    error_message: Mapped[str | None] = mapped_column(Text)
    assigned_reviewer: Mapped[str | None] = mapped_column(String(120))

    # Extracted header fields. NULL = absent/unextracted (distinct from 0 or "").
    invoice_number: Mapped[str | None] = mapped_column(String(120), index=True)
    invoice_date: Mapped[date | None] = mapped_column(Date, index=True)
    due_date: Mapped[date | None] = mapped_column(Date)
    vendor_name: Mapped[str | None] = mapped_column(String(255), index=True)
    vendor_address: Mapped[str | None] = mapped_column(Text)
    vendor_tax_id: Mapped[str | None] = mapped_column(String(80))
    vendor_email: Mapped[str | None] = mapped_column(String(255))
    vendor_phone: Mapped[str | None] = mapped_column(String(60))
    customer_name: Mapped[str | None] = mapped_column(String(255))
    customer_address: Mapped[str | None] = mapped_column(Text)
    customer_tax_id: Mapped[str | None] = mapped_column(String(80))
    currency: Mapped[str | None] = mapped_column(String(3))
    subtotal: Mapped[Decimal | None] = mapped_column(MONEY())
    tax_amount: Mapped[Decimal | None] = mapped_column(MONEY())
    discount: Mapped[Decimal | None] = mapped_column(MONEY())
    shipping_charges: Mapped[Decimal | None] = mapped_column(MONEY())
    grand_total: Mapped[Decimal | None] = mapped_column(MONEY())
    payment_terms: Mapped[str | None] = mapped_column(Text)
    payment_reference: Mapped[str | None] = mapped_column(String(255))

    # Which fields the extractor could not read / were ambiguous, + per-field evidence.
    field_warnings: Mapped[dict | None] = mapped_column(JSON)
    field_evidence: Mapped[dict | None] = mapped_column(JSON)
    is_manually_edited: Mapped[bool] = mapped_column(Boolean, default=False)
    duplicate_of_id: Mapped[str | None] = mapped_column(String(32))

    is_archived: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    archived_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow, onupdate=utcnow)

    document: Mapped[SourceDocument | None] = relationship(back_populates="invoice")
    line_items: Mapped[list["InvoiceLineItem"]] = relationship(
        back_populates="invoice", cascade="all, delete-orphan", order_by="InvoiceLineItem.position")
    issues: Mapped[list["ValidationIssue"]] = relationship(
        back_populates="invoice", order_by="ValidationIssue.created_at")
    reviews: Mapped[list["ReviewHistory"]] = relationship(
        back_populates="invoice", order_by="ReviewHistory.created_at.desc()")
    extraction_results: Mapped[list["ExtractionResult"]] = relationship(
        back_populates="invoice", order_by="ExtractionResult.run_number")

    # Read-only conveniences used by the response schemas.
    @property
    def file_name(self) -> str | None:
        return self.document.original_filename if self.document else None

    @property
    def file_size(self) -> int | None:
        return self.document.size_bytes if self.document else None

    @property
    def page_count(self) -> int | None:
        return self.document.page_count if self.document else None

    @property
    def has_file(self) -> bool:
        return self.document is not None

    @property
    def needs_verification(self) -> bool:
        return bool(self.field_warnings) or any(
            i.is_current and i.category == "needs_verification" for i in self.issues)

    @property
    def validation_issues(self) -> list["ValidationIssue"]:
        return [i for i in self.issues if i.is_current]

    @property
    def review_history(self) -> list["ReviewHistory"]:
        return list(self.reviews)


class InvoiceLineItem(Base):
    __tablename__ = "invoice_line_items"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=lambda: new_id("li"))
    invoice_id: Mapped[str] = mapped_column(ForeignKey("invoices.id"), index=True)
    position: Mapped[int] = mapped_column(Integer, default=0)
    description: Mapped[str | None] = mapped_column(Text)
    quantity: Mapped[Decimal | None] = mapped_column(QTY())
    unit_price: Mapped[Decimal | None] = mapped_column(MONEY())
    discount: Mapped[Decimal | None] = mapped_column(MONEY())  # per-line discount AMOUNT
    discount_percent: Mapped[Decimal | None] = mapped_column(ScaledDecimal(4))  # only if printed as %
    tax_rate: Mapped[Decimal | None] = mapped_column(ScaledDecimal(4))  # percent
    line_total: Mapped[Decimal | None] = mapped_column(MONEY())
    page: Mapped[int | None] = mapped_column(Integer)
    is_manually_edited: Mapped[bool] = mapped_column(Boolean, default=False)

    invoice: Mapped[Invoice] = relationship(back_populates="line_items")


class ExtractionResult(Base):
    """Immutable record of each extraction run, so re-processing never erases earlier output."""
    __tablename__ = "extraction_results"
    __table_args__ = (UniqueConstraint("invoice_id", "run_number"),)
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=lambda: new_id("ext"))
    invoice_id: Mapped[str] = mapped_column(ForeignKey("invoices.id"), index=True)
    document_id: Mapped[str] = mapped_column(ForeignKey("source_documents.id"))
    run_number: Mapped[int] = mapped_column(Integer)
    model: Mapped[str] = mapped_column(String(120))
    input_mode: Mapped[str] = mapped_column(String(20))  # text | images
    pages_sent: Mapped[int] = mapped_column(Integer)
    raw_output: Mapped[dict] = mapped_column(JSON)
    warnings: Mapped[list | None] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)

    invoice: Mapped[Invoice] = relationship(back_populates="extraction_results")


class ValidationIssue(Base):
    __tablename__ = "validation_issues"
    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: new_id("iss"))
    issue_key: Mapped[str] = mapped_column(String(40), index=True)  # stable across re-validation
    invoice_id: Mapped[str] = mapped_column(ForeignKey("invoices.id"), index=True)
    rule_code: Mapped[str] = mapped_column(String(60), index=True)
    rule_title: Mapped[str] = mapped_column(String(200))
    field: Mapped[str | None] = mapped_column(String(80))
    severity: Mapped[str] = mapped_column(String(20), index=True)  # critical|warning|info
    category: Mapped[str] = mapped_column(String(30), default="discrepancy")  # or needs_verification
    actual_value: Mapped[str | None] = mapped_column(Text)
    expected_value: Mapped[str | None] = mapped_column(Text)
    explanation: Mapped[str] = mapped_column(Text)
    recommended_action: Mapped[str] = mapped_column(Text)
    resolution_status: Mapped[str] = mapped_column(String(20), default="open")  # open|resolved
    is_current: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)

    invoice: Mapped[Invoice] = relationship(back_populates="issues")


class ReviewHistory(Base):
    __tablename__ = "review_history"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=lambda: new_id("rev"))
    invoice_id: Mapped[str] = mapped_column(ForeignKey("invoices.id"), index=True)
    action: Mapped[str] = mapped_column(String(30))
    previous_status: Mapped[str] = mapped_column(String(30))
    new_status: Mapped[str] = mapped_column(String(30))
    comment: Mapped[str | None] = mapped_column(Text)
    actor: Mapped[str] = mapped_column(String(120))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow, index=True)

    invoice: Mapped[Invoice] = relationship(back_populates="reviews")


class AuditEvent(Base):
    """Append-only. invoice_id is deliberately NOT a foreign key so history survives deletion."""
    __tablename__ = "audit_events"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=lambda: new_id("aud"))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow, index=True)
    action: Mapped[str] = mapped_column(String(60), index=True)
    category: Mapped[str] = mapped_column(String(20), index=True)
    invoice_id: Mapped[str | None] = mapped_column(String(32), index=True)
    invoice_number: Mapped[str | None] = mapped_column(String(120))
    actor: Mapped[str] = mapped_column(String(120))
    description: Mapped[str] = mapped_column(Text)
    details: Mapped[dict | None] = mapped_column(JSON)  # e.g. field-level old/new values + reason
