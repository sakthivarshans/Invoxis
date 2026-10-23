"""Invoice persistence: queries, manual CRUD, audited edits, archival, and persisted validation."""
from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import Select, and_, case, func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.core.config import Settings
from app.core.errors import AppError, ConflictError, NotFoundError
from app.db.models import Invoice, InvoiceLineItem, SourceDocument, ValidationIssue, utcnow
from app.schemas.invoice import InvoiceCreate, InvoiceUpdate
from app.services import audit_service
from app.services.invoice_validation import IssueDraft, ValidationConfig, validate_invoice

HEADER_FIELDS = [
    "invoice_number", "invoice_date", "due_date", "vendor_name", "vendor_address", "vendor_tax_id",
    "vendor_email", "vendor_phone", "customer_name", "customer_address", "customer_tax_id", "currency",
    "subtotal", "tax_amount", "discount", "shipping_charges", "grand_total", "payment_terms",
    "payment_reference",
]
LINE_FIELDS = ["description", "quantity", "unit_price", "discount", "discount_percent", "tax_rate",
               "line_total"]
SORTABLE = {
    "created_at": Invoice.created_at, "invoice_date": Invoice.invoice_date,
    "invoice_number": Invoice.invoice_number, "vendor_name": Invoice.vendor_name,
    "grand_total": Invoice.grand_total, "updated_at": Invoice.updated_at,
    "review_status": Invoice.review_status, "validation_status": Invoice.validation_status,
}


def _canon(v: Any) -> str | None:
    if v is None:
        return None
    if isinstance(v, Decimal):
        return format(v.normalize(), "f") if v != 0 else "0"
    return str(v)


def _eager(stmt: Select) -> Select:
    return stmt.options(selectinload(Invoice.line_items), selectinload(Invoice.issues),
                        selectinload(Invoice.reviews), selectinload(Invoice.document))


# ------------------------------------------------------------------------------ queries
def get_invoice(db: Session, invoice_id: str, *, include_archived: bool = False) -> Invoice:
    inv = db.scalars(_eager(select(Invoice).where(Invoice.id == invoice_id))).first()
    if inv is None or (inv.is_archived and not include_archived):
        raise NotFoundError(f"Invoice '{invoice_id}' was not found.", code="invoice_not_found")
    return inv


def list_invoices(db: Session, *, page: int, page_size: int, q: str | None = None,
                  vendor: str | None = None, processing_status: str | None = None,
                  validation_status: str | None = None, review_status: str | None = None,
                  date_from: date | None = None, date_to: date | None = None,
                  sort: str = "created_at", order: str = "desc",
                  include_archived: bool = False) -> tuple[list[Invoice], int]:
    if sort not in SORTABLE:
        raise AppError(f"Cannot sort by '{sort}'.", code="invalid_sort", status_code=422,
                       details={"allowed": sorted(SORTABLE)})
    conds = []
    if not include_archived:
        conds.append(Invoice.is_archived.is_(False))
    if q:
        like = f"%{q.strip().lower()}%"
        conds.append(or_(func.lower(func.coalesce(Invoice.invoice_number, "")).like(like),
                         func.lower(func.coalesce(Invoice.vendor_name, "")).like(like),
                         Invoice.document.has(func.lower(SourceDocument.original_filename).like(like))))
    if vendor:
        conds.append(func.lower(func.coalesce(Invoice.vendor_name, "")) == vendor.strip().lower())
    if processing_status:
        conds.append(Invoice.processing_status == processing_status)
    if validation_status:
        conds.append(Invoice.validation_status == validation_status)
    if review_status:
        conds.append(Invoice.review_status == review_status)
    if date_from:
        conds.append(Invoice.invoice_date >= date_from)
    if date_to:
        conds.append(Invoice.invoice_date <= date_to)
    where = and_(*conds) if conds else True
    total = db.scalar(select(func.count()).select_from(Invoice).where(where)) or 0
    col = SORTABLE[sort]
    col = col.asc() if order == "asc" else col.desc()
    stmt = _eager(select(Invoice).where(where)).order_by(col, Invoice.id).offset(
        (page - 1) * page_size).limit(page_size)
    return list(db.scalars(stmt)), total


# ------------------------------------------------------------------------------- create
def _make_lines(items) -> list[InvoiceLineItem]:
    return [InvoiceLineItem(position=i, **{f: getattr(li, f) for f in LINE_FIELDS})
            for i, li in enumerate(items)]


def create_manual(db: Session, body: InvoiceCreate, settings: Settings, actor: str) -> Invoice:
    data = body.model_dump(exclude={"line_items"})
    if data.get("currency"):
        data["currency"] = data["currency"].upper()
    inv = Invoice(**data, processing_status="completed", is_manually_edited=True)
    inv.line_items = _make_lines(body.line_items)
    db.add(inv)
    db.flush()
    audit_service.record(db, action="INVOICE_CREATED_MANUALLY", category="system", actor=actor,
                         invoice=inv, description=f"Invoice {inv.invoice_number or inv.id} created manually.")
    run_validation(db, inv, settings, actor=actor)
    return inv


# ------------------------------------------------------------------------------- update
def update_invoice(db: Session, inv: Invoice, body: InvoiceUpdate, settings: Settings,
                   actor: str) -> Invoice:
    if body.expected_version is not None and body.expected_version != inv.version:
        raise ConflictError(
            "This invoice was changed since you loaded it. Reload and re-apply your edits.",
            code="version_conflict", details={"current_version": inv.version})
    if inv.review_status == "approved":
        raise ConflictError("Approved invoices are locked. Re-open the invoice for review before editing.",
                            code="invoice_locked")
    if inv.processing_status in ("queued", "processing"):
        raise ConflictError("The invoice is still being processed.", code="invoice_processing")

    provided = body.model_fields_set
    changes: list[dict] = []
    for f in HEADER_FIELDS:
        if f not in provided:
            continue
        new = getattr(body, f)
        if f == "currency" and new:
            new = new.upper()
        old = getattr(inv, f)
        if _canon(old) != _canon(new):
            changes.append({"field": f, "old": _canon(old), "new": _canon(new)})
            setattr(inv, f, new)
            # an explicit human edit supersedes the extractor's uncertainty flag for that field
            if inv.field_warnings and _camel(f) in inv.field_warnings:
                fw = dict(inv.field_warnings)
                fw.pop(_camel(f))
                inv.field_warnings = fw or None

    line_change = None
    if "line_items" in provided and body.line_items is not None:
        old_lines = [{f: _canon(getattr(li, f)) for f in LINE_FIELDS} for li in inv.line_items]
        new_lines = [{f: _canon(getattr(li, f)) for f in LINE_FIELDS} for li in body.line_items]
        if old_lines != new_lines:
            flags = [i >= len(old_lines) or old_lines[i] != new_lines[i] for i in range(len(new_lines))]
            replacement = _make_lines(body.line_items)
            for li, flag in zip(replacement, flags):
                li.is_manually_edited = flag
            inv.line_items = replacement
            line_change = {"old": old_lines, "new": new_lines}

    if not changes and line_change is None:
        return inv  # no-op: no version bump, no audit noise

    inv.is_manually_edited = True
    inv.version += 1
    inv.updated_at = utcnow()
    details: dict = {"changes": changes, "reason": body.reason}
    if line_change:
        details["line_items"] = line_change
    audit_service.record(
        db, action="INVOICE_FIELDS_MODIFIED", category="extraction", actor=actor, invoice=inv,
        description=f"Invoice {inv.invoice_number or inv.id}: {len(changes)} field(s)"
                    + (" and line items" if line_change else "") + " manually edited.",
        details=details)
    db.flush()
    db.refresh(inv, ["line_items"])
    run_validation(db, inv, settings, actor=actor)
    return inv


def _camel(attr: str) -> str:
    head, *rest = attr.split("_")
    return head + "".join(p.title() for p in rest)


# ------------------------------------------------------------------------------ archive
def archive_invoice(db: Session, inv: Invoice, actor: str) -> None:
    """Soft delete. Line items, issues, reviews, audit events and the stored PDF are all retained."""
    if inv.processing_status == "processing":
        raise ConflictError("Cannot archive an invoice while it is being processed.", code="invoice_processing")
    inv.is_archived = True
    inv.archived_at = utcnow()
    inv.version += 1
    audit_service.record(db, action="DOCUMENT_ARCHIVED", category="system", actor=actor, invoice=inv,
                         description=f"Invoice {inv.invoice_number or inv.id} archived (records retained).")
    # Archived invoices stop counting as duplicate peers; refresh any invoice that pointed at it.
    db.flush()


# ----------------------------------------------------------------------------- validation
def _peer_query(db: Session, inv: Invoice) -> list[Invoice]:
    if not (inv.vendor_name or "").strip():
        return []
    return list(db.scalars(select(Invoice).where(
        Invoice.id != inv.id, Invoice.is_archived.is_(False),
        Invoice.processing_status.in_(("completed", "needs_review")),
        func.lower(func.trim(Invoice.vendor_name)) == inv.vendor_name.strip().lower())))


def run_validation(db: Session, inv: Invoice, settings: Settings, *, actor: str,
                   tolerance: Decimal | None = None, detect_duplicates: bool | None = None,
                   cascade: bool = True, audit: bool = True) -> list[ValidationIssue]:
    if inv.processing_status in ("queued", "processing", "failed"):
        raise ConflictError(f"Invoice is '{inv.processing_status}' and cannot be validated.",
                            code="invoice_not_validatable")
    cfg = ValidationConfig(
        tolerance=tolerance if tolerance is not None else Decimal(settings.rounding_tolerance),
        max_plausible_amount=Decimal(settings.max_plausible_amount),
        detect_duplicates=True if detect_duplicates is None else detect_duplicates)
    peers = _peer_query(db, inv)
    outcome = validate_invoice(inv, peers, cfg)

    current = {i.issue_key: i for i in inv.issues if i.is_current}
    seen: set[str] = set()
    for d in outcome.issues:
        seen.add(d.issue_key)
        row = current.get(d.issue_key)
        if row is None:
            row = ValidationIssue(issue_key=d.issue_key, invoice_id=inv.id, is_current=True)
            db.add(row)
            inv.issues.append(row)
        _apply_draft(row, d)
    now = utcnow()
    for key, row in current.items():
        if key not in seen:  # no longer triggered: kept for history, marked resolved
            row.is_current = False
            row.resolution_status = "resolved"
            row.created_at = row.created_at or now

    inv.validation_status = outcome.status
    if inv.processing_status in ("completed", "needs_review"):
        inv.processing_status = "needs_review" if outcome.status != "valid" else "completed"
        if inv.document is not None:
            inv.document.status = inv.processing_status

    dup_ids = sorted(p.id for p in peers
                     if (p.invoice_number or "").strip().lower() == (inv.invoice_number or "").strip().lower()
                     and (inv.invoice_number or "").strip())
    inv.duplicate_of_id = dup_ids[0] if dup_ids and cfg.detect_duplicates else None

    if audit:
        audit_service.record(
            db, action="VALIDATION_RUN", category="validation", actor=actor, invoice=inv,
            description=f"Validation for {inv.invoice_number or inv.id}: {outcome.status} "
                        f"({len(outcome.issues)} finding(s)).",
            details={"status": outcome.status, "rules": sorted({d.rule_code for d in outcome.issues})})
    db.flush()

    if cascade and dup_ids and cfg.detect_duplicates:
        for pid in dup_ids:
            partner = get_invoice(db, pid)
            run_validation(db, partner, settings, actor=actor, tolerance=tolerance, cascade=False,
                           audit=False)
    return [i for i in inv.issues if i.is_current]


def _apply_draft(row: ValidationIssue, d: IssueDraft) -> None:
    row.rule_code, row.rule_title, row.field = d.rule_code, d.rule_title, d.field
    row.severity, row.category = d.severity, d.category
    row.actual_value, row.expected_value = d.actual_value, d.expected_value
    row.explanation, row.recommended_action = d.explanation, d.recommended_action
    row.resolution_status = "open"


def list_issues(db: Session, *, page: int, page_size: int, severity: str | None = None,
                rule_code: str | None = None, invoice_id: str | None = None,
                category: str | None = None, q: str | None = None,
                include_history: bool = False) -> tuple[list[ValidationIssue], int]:
    conds = [Invoice.is_archived.is_(False)]
    if not include_history:
        conds.append(ValidationIssue.is_current.is_(True))
    if severity:
        conds.append(ValidationIssue.severity == severity)
    if rule_code:
        conds.append(ValidationIssue.rule_code == rule_code)
    if invoice_id:
        conds.append(ValidationIssue.invoice_id == invoice_id)
    if category:
        conds.append(ValidationIssue.category == category)
    if q:
        like = f"%{q.strip().lower()}%"
        conds.append(or_(func.lower(ValidationIssue.rule_title).like(like),
                         func.lower(func.coalesce(Invoice.invoice_number, "")).like(like),
                         func.lower(func.coalesce(Invoice.vendor_name, "")).like(like)))
    base = select(ValidationIssue, Invoice).join(Invoice, Invoice.id == ValidationIssue.invoice_id).where(*conds)
    total = db.scalar(select(func.count()).select_from(base.subquery())) or 0
    sev_order = case((ValidationIssue.severity == "critical", 0),
                     (ValidationIssue.severity == "warning", 1), else_=2)
    rows = db.execute(base.order_by(sev_order, ValidationIssue.created_at.desc(), ValidationIssue.id)
                      .offset((page - 1) * page_size).limit(page_size)).all()
    out = []
    for issue, inv in rows:
        issue.invoice_number, issue.vendor_name = inv.invoice_number, inv.vendor_name  # transient attrs
        out.append(issue)
    return out, total
