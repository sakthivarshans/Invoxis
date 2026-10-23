"""Cross-invoice views: validation issues, review queue, reports, audit log."""
from datetime import datetime
from decimal import Decimal
from typing import Literal

from fastapi import APIRouter, Query
from sqlalchemy import func, or_, select

from app.api.deps import DB
from app.db.models import AuditEvent, Invoice, ValidationIssue
from app.schemas.common import Page
from app.schemas.invoice import InvoiceRead, ValidationIssueRead
from app.schemas.workflow import AuditEventRead, SummaryReport, ValidationReport
from app.services import invoice_service as svc

router = APIRouter(tags=["workflow"])
LIVE = Invoice.is_archived.is_(False)


@router.get("/validation/issues", response_model=Page[ValidationIssueRead])
def validation_issues(
    db: DB, page: int = Query(1, ge=1), page_size: int = Query(50, ge=1, le=200),
    severity: Literal["critical", "warning", "info"] | None = None, rule_code: str | None = None,
    invoice_id: str | None = None, category: Literal["discrepancy", "needs_verification"] | None = None,
    q: str | None = Query(None, max_length=100), include_history: bool = False):
    items, total = svc.list_issues(db, page=page, page_size=page_size, severity=severity,
                                   rule_code=rule_code, invoice_id=invoice_id, category=category, q=q,
                                   include_history=include_history)
    return Page(items=[ValidationIssueRead.model_validate(i) for i in items], total=total, page=page,
                page_size=page_size)


@router.get("/review-queue", response_model=Page[InvoiceRead])
def review_queue(db: DB, page: int = Query(1, ge=1), page_size: int = Query(25, ge=1, le=200)):
    """Invoices needing human attention: extracted, not yet decided, and either in an active review
    state or carrying validation findings."""
    cond = (LIVE, Invoice.processing_status.in_(("completed", "needs_review")),
            or_(Invoice.review_status.in_(("in_review", "returned_for_correction")),
                (Invoice.review_status == "pending") & Invoice.validation_status.in_(("warning", "critical"))))
    total = db.scalar(select(func.count()).select_from(Invoice).where(*cond)) or 0
    items = db.scalars(svc._eager(select(Invoice).where(*cond)).order_by(Invoice.updated_at.desc())
                       .offset((page - 1) * page_size).limit(page_size)).all()
    return Page(items=[InvoiceRead.model_validate(i) for i in items], total=total, page=page, page_size=page_size)


def _counts(db, col) -> dict[str, int]:
    return {k: v for k, v in db.execute(select(col, func.count()).where(LIVE).group_by(col)).all()}


@router.get("/reports/summary", response_model=SummaryReport)
def summary(db: DB):
    totals: dict[str, Decimal] = {}
    for cur, tot in db.execute(select(Invoice.currency, Invoice.grand_total).where(
            LIVE, Invoice.grand_total.is_not(None), Invoice.processing_status.in_(("completed", "needs_review")))):
        totals[cur or "UNSPECIFIED"] = totals.get(cur or "UNSPECIFIED", Decimal(0)) + tot
    spend: dict[tuple[str, str], Decimal] = {}
    for vendor, cur, tot in db.execute(select(Invoice.vendor_name, Invoice.currency, Invoice.grand_total).where(
            LIVE, Invoice.grand_total.is_not(None), Invoice.review_status != "rejected",
            Invoice.processing_status.in_(("completed", "needs_review")))):
        k = (vendor or "(unknown vendor)", cur or "UNSPECIFIED")
        spend[k] = spend.get(k, Decimal(0)) + tot
    top = sorted(spend.items(), key=lambda kv: kv[1], reverse=True)[:10]
    attention = db.scalar(select(func.count()).select_from(Invoice).where(
        LIVE, or_(Invoice.processing_status.in_(("needs_review", "failed")),
                  Invoice.review_status.in_(("pending", "in_review", "returned_for_correction")) &
                  Invoice.validation_status.in_(("warning", "critical"))))) or 0
    return SummaryReport(
        total_invoices=db.scalar(select(func.count()).select_from(Invoice).where(LIVE)) or 0,
        by_processing_status=_counts(db, Invoice.processing_status),
        by_validation_status=_counts(db, Invoice.validation_status),
        by_review_status=_counts(db, Invoice.review_status), totals_by_currency=totals,
        spend_by_vendor=[{"vendor": v, "currency": c, "total": format(t, "f")} for (v, c), t in top],
        needs_attention=attention)


@router.get("/reports/validation", response_model=ValidationReport)
def validation_report(db: DB):
    by_status = _counts(db, Invoice.validation_status)
    cur = (ValidationIssue.is_current.is_(True), LIVE)
    rows = db.execute(select(ValidationIssue.rule_code, func.count()).join(Invoice).where(*cur)
                      .group_by(ValidationIssue.rule_code)).all()
    sev = db.execute(select(ValidationIssue.severity, func.count()).join(Invoice).where(*cur)
                     .group_by(ValidationIssue.severity)).all()
    return ValidationReport(
        total_invoices=sum(_counts(db, Invoice.processing_status).values()),
        passed=by_status.get("valid", 0), warning_invoices=by_status.get("warning", 0),
        critical_invoices=by_status.get("critical", 0), total_issues=sum(n for _, n in rows),
        issues_by_rule=dict(rows), issues_by_severity=dict(sev))


@router.get("/audit-logs", response_model=Page[AuditEventRead])
def audit_logs(db: DB, page: int = Query(1, ge=1), page_size: int = Query(50, ge=1, le=200),
               category: Literal["upload", "extraction", "validation", "review", "system", "settings"] | None = None,
               invoice_id: str | None = None, action: str | None = None, q: str | None = Query(None, max_length=100),
               since: datetime | None = None, until: datetime | None = None):
    conds = []
    if category: conds.append(AuditEvent.category == category)
    if invoice_id: conds.append(AuditEvent.invoice_id == invoice_id)
    if action: conds.append(AuditEvent.action == action)
    if since: conds.append(AuditEvent.created_at >= since)
    if until: conds.append(AuditEvent.created_at <= until)
    if q:
        like = f"%{q.strip().lower()}%"
        conds.append(or_(func.lower(AuditEvent.description).like(like), func.lower(AuditEvent.action).like(like),
                         func.lower(func.coalesce(AuditEvent.invoice_number, "")).like(like)))
    total = db.scalar(select(func.count()).select_from(AuditEvent).where(*conds)) or 0
    rows = db.scalars(select(AuditEvent).where(*conds).order_by(AuditEvent.created_at.desc(), AuditEvent.id)
                      .offset((page - 1) * page_size).limit(page_size)).all()
    return Page(items=[AuditEventRead.model_validate(r) for r in rows], total=total, page=page, page_size=page_size)
