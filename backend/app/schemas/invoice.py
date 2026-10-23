from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, Field, field_validator

from app.schemas.common import (DecimalStr, ORMModel, ProcessingStatus, ReviewAction, ReviewStatus,
                                Severity, ValidationStatus)

MAX_AMOUNT = Decimal("1e12")


def _check_amount(v: Decimal | None) -> Decimal | None:
    if v is None:
        return v
    if not v.is_finite():
        raise ValueError("must be a finite number")
    if abs(v) > MAX_AMOUNT:
        raise ValueError("amount out of range")
    return v


class LineItemRead(ORMModel):
    id: str
    position: int
    description: str | None
    quantity: DecimalStr | None
    unit_price: DecimalStr | None
    discount: DecimalStr | None
    discount_percent: DecimalStr | None
    tax_rate: DecimalStr | None
    line_total: DecimalStr | None
    page: int | None
    is_manually_edited: bool


class LineItemIn(BaseModel):
    description: str | None = Field(None, max_length=2000)
    quantity: Decimal | None = None
    unit_price: Decimal | None = None
    discount: Decimal | None = None
    discount_percent: Decimal | None = None
    tax_rate: Decimal | None = None
    line_total: Decimal | None = None

    _amt = field_validator("quantity", "unit_price", "discount", "discount_percent", "tax_rate",
                           "line_total")(lambda v: _check_amount(v))


class ValidationIssueRead(ORMModel):
    id: str
    issue_key: str
    invoice_id: str
    rule_code: str
    rule_title: str
    field: str | None
    severity: Severity
    category: str
    actual_value: str | None
    expected_value: str | None
    explanation: str
    recommended_action: str
    resolution_status: str
    is_current: bool
    created_at: datetime
    # joined for convenience in cross-invoice listings
    invoice_number: str | None = None
    vendor_name: str | None = None


class ReviewHistoryRead(ORMModel):
    id: str
    action: ReviewAction
    previous_status: ReviewStatus
    new_status: ReviewStatus
    comment: str | None
    actor: str
    created_at: datetime


class InvoiceRead(ORMModel):
    id: str
    document_id: str | None
    file_name: str | None = None
    file_size: int | None = None
    page_count: int | None = None
    has_file: bool = False
    version: int
    processing_status: ProcessingStatus
    validation_status: ValidationStatus
    review_status: ReviewStatus
    error_message: str | None
    assigned_reviewer: str | None
    invoice_number: str | None
    invoice_date: date | None
    due_date: date | None
    vendor_name: str | None
    vendor_address: str | None
    vendor_tax_id: str | None
    vendor_email: str | None
    vendor_phone: str | None
    customer_name: str | None
    customer_address: str | None
    customer_tax_id: str | None
    currency: str | None
    subtotal: DecimalStr | None
    tax_amount: DecimalStr | None
    discount: DecimalStr | None
    shipping_charges: DecimalStr | None
    grand_total: DecimalStr | None
    payment_terms: str | None
    payment_reference: str | None
    line_items: list[LineItemRead]
    field_warnings: dict | None
    needs_verification: bool = False
    is_manually_edited: bool
    duplicate_of_id: str | None
    is_archived: bool
    review_history: list[ReviewHistoryRead] = []
    created_at: datetime
    updated_at: datetime


class InvoiceDetail(InvoiceRead):
    validation_issues: list[ValidationIssueRead] = []


class InvoiceCreate(BaseModel):
    """Manual entry (no source document). Extraction-created invoices come from uploads."""
    invoice_number: str | None = Field(None, max_length=120)
    invoice_date: date | None = None
    due_date: date | None = None
    vendor_name: str | None = Field(None, max_length=255)
    vendor_address: str | None = Field(None, max_length=2000)
    vendor_tax_id: str | None = Field(None, max_length=80)
    customer_name: str | None = Field(None, max_length=255)
    customer_address: str | None = Field(None, max_length=2000)
    customer_tax_id: str | None = Field(None, max_length=80)
    currency: str | None = Field(None, pattern=r"^[A-Za-z]{3}$")
    subtotal: Decimal | None = None
    tax_amount: Decimal | None = None
    discount: Decimal | None = None
    shipping_charges: Decimal | None = None
    grand_total: Decimal | None = None
    payment_terms: str | None = Field(None, max_length=1000)
    payment_reference: str | None = Field(None, max_length=255)
    line_items: list[LineItemIn] = Field(default_factory=list, max_length=500)

    _amt = field_validator("subtotal", "tax_amount", "discount", "shipping_charges",
                           "grand_total")(lambda v: _check_amount(v))


class InvoiceUpdate(BaseModel):
    """PATCH body. Omitted = unchanged; explicit null = clear the value."""
    expected_version: int | None = Field(None, ge=1, description="Optimistic-concurrency token")
    reason: str | None = Field(None, max_length=500)

    invoice_number: str | None = Field(None, max_length=120)
    invoice_date: date | None = None
    due_date: date | None = None
    vendor_name: str | None = Field(None, max_length=255)
    vendor_address: str | None = Field(None, max_length=2000)
    vendor_tax_id: str | None = Field(None, max_length=80)
    vendor_email: str | None = Field(None, max_length=255)
    vendor_phone: str | None = Field(None, max_length=60)
    customer_name: str | None = Field(None, max_length=255)
    customer_address: str | None = Field(None, max_length=2000)
    customer_tax_id: str | None = Field(None, max_length=80)
    currency: str | None = Field(None, pattern=r"^[A-Za-z]{3}$")
    subtotal: Decimal | None = None
    tax_amount: Decimal | None = None
    discount: Decimal | None = None
    shipping_charges: Decimal | None = None
    grand_total: Decimal | None = None
    payment_terms: str | None = Field(None, max_length=1000)
    payment_reference: str | None = Field(None, max_length=255)
    line_items: list[LineItemIn] | None = Field(None, max_length=500)

    _amt = field_validator("subtotal", "tax_amount", "discount", "shipping_charges",
                           "grand_total")(lambda v: _check_amount(v))
