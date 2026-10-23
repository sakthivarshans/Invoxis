from datetime import date
from typing import Literal

from fastapi import APIRouter, Query, Response

from app.api.deps import DB, SettingsDep, actor_of
from app.core.errors import ConflictError
from app.db.models import SourceDocument
from app.schemas.common import Page
from app.schemas.invoice import (InvoiceCreate, InvoiceDetail, InvoiceRead, InvoiceUpdate,
                                 ValidationIssueRead)
from app.schemas.workflow import (DocumentStatus, ExtractionRead, ReviewRequest, ValidateRequest,
                                  ValidationResultRead)
from app.schemas.invoice import ReviewHistoryRead
from app.services import invoice_service as svc, processing_service as proc, review_service

router = APIRouter(prefix="/invoices", tags=["invoices"])


@router.get("", response_model=Page[InvoiceRead])
def list_invoices(
    db: DB, page: int = Query(1, ge=1), page_size: int = Query(25, ge=1, le=200),
    q: str | None = Query(None, max_length=100), vendor: str | None = Query(None, max_length=255),
    processing_status: Literal["queued", "processing", "completed", "needs_review", "failed"] | None = None,
    validation_status: Literal["valid", "warning", "critical", "unvalidated"] | None = None,
    review_status: Literal["pending", "in_review", "approved", "rejected", "returned_for_correction"] | None = None,
    date_from: date | None = None, date_to: date | None = None,
    sort: str = "created_at", order: Literal["asc", "desc"] = "desc", include_archived: bool = False,
):
    items, total = svc.list_invoices(
        db, page=page, page_size=page_size, q=q, vendor=vendor, processing_status=processing_status,
        validation_status=validation_status, review_status=review_status, date_from=date_from,
        date_to=date_to, sort=sort, order=order, include_archived=include_archived)
    return Page(items=[InvoiceRead.model_validate(i) for i in items], total=total, page=page,
                page_size=page_size)


@router.post("", response_model=InvoiceDetail, status_code=201)
def create_invoice(body: InvoiceCreate, db: DB, settings: SettingsDep):
    inv = svc.create_manual(db, body, settings, actor_of(settings))
    iid = inv.id
    db.commit()       # COMMIT BEFORE RESPONDING: dependency teardown runs after the response is sent,
    db.expire_all()   # so relying on it would let a fast client read stale data (no read-your-writes).
    return InvoiceDetail.model_validate(svc.get_invoice(db, iid))


@router.get("/{invoice_id}", response_model=InvoiceDetail)
def get_invoice(invoice_id: str, db: DB):
    return InvoiceDetail.model_validate(svc.get_invoice(db, invoice_id))


@router.patch("/{invoice_id}", response_model=InvoiceDetail)
def update_invoice(invoice_id: str, body: InvoiceUpdate, db: DB, settings: SettingsDep):
    inv = svc.get_invoice(db, invoice_id)
    svc.update_invoice(db, inv, body, settings, actor_of(settings))
    db.commit()
    db.expire_all()
    return InvoiceDetail.model_validate(svc.get_invoice(db, invoice_id))


@router.delete("/{invoice_id}", status_code=204)
def archive_invoice(invoice_id: str, db: DB, settings: SettingsDep):
    """Soft-delete (archive). Audit history, review history, validation history and the PDF are kept."""
    svc.archive_invoice(db, svc.get_invoice(db, invoice_id), actor_of(settings))
    db.commit()
    return Response(status_code=204)


@router.post("/{invoice_id}/reprocess", response_model=DocumentStatus, status_code=202)
def reprocess(invoice_id: str, db: DB, settings: SettingsDep, force: bool = False):
    inv = svc.get_invoice(db, invoice_id)
    if inv.document is None:
        raise ConflictError("This invoice has no source document to reprocess.", code="no_source_document")
    doc = db.get(SourceDocument, inv.document_id)
    job, created = proc.request_extraction(db, doc, settings, actor_of(settings), mode="reprocess", force=force)
    db.commit()
    if created:
        proc.enqueue(job.id, settings)
    db.expire_all()
    doc = db.get(SourceDocument, inv.document_id)
    j = proc.latest_job(doc)
    return DocumentStatus(document_id=doc.id, invoice_id=invoice_id, status=doc.status,
                          error_code=doc.error_code, error_message=doc.error_message,
                          attempt=j.attempt if j else None)


@router.get("/{invoice_id}/extraction", response_model=ExtractionRead)
def get_extraction(invoice_id: str, db: DB):
    inv = svc.get_invoice(db, invoice_id)
    last = inv.extraction_results[-1] if inv.extraction_results else None
    return ExtractionRead(
        invoice_id=inv.id, document_id=inv.document_id,
        run_number=last.run_number if last else None, model=last.model if last else None,
        input_mode=last.input_mode if last else None, pages_sent=last.pages_sent if last else None,
        extracted_at=last.created_at if last else None, warnings=last.warnings if last else None,
        field_warnings=inv.field_warnings, field_evidence=inv.field_evidence,
        raw_output=last.raw_output if last else None)


@router.post("/{invoice_id}/validate", response_model=ValidationResultRead)
def validate(invoice_id: str, db: DB, settings: SettingsDep, body: ValidateRequest | None = None):
    inv = svc.get_invoice(db, invoice_id)
    body = body or ValidateRequest()
    svc.run_validation(db, inv, settings, actor=actor_of(settings), tolerance=body.tolerance,
                       detect_duplicates=body.detect_duplicates)
    db.commit()
    db.expire_all()
    return _validation_result(svc.get_invoice(db, invoice_id))


@router.get("/{invoice_id}/validation", response_model=ValidationResultRead)
def get_validation(invoice_id: str, db: DB):
    return _validation_result(svc.get_invoice(db, invoice_id))


def _validation_result(inv) -> ValidationResultRead:
    cur = inv.validation_issues
    return ValidationResultRead(
        invoice_id=inv.id, validation_status=inv.validation_status, issue_count=len(cur),
        critical_count=sum(i.severity == "critical" for i in cur),
        warning_count=sum(i.severity == "warning" for i in cur),
        needs_verification_count=sum(i.category == "needs_verification" for i in cur),
        issues=[ValidationIssueRead.model_validate(i).model_copy(
            update={"invoice_number": inv.invoice_number, "vendor_name": inv.vendor_name}) for i in cur])


@router.post("/{invoice_id}/review", response_model=InvoiceDetail)
def review(invoice_id: str, body: ReviewRequest, db: DB, settings: SettingsDep):
    inv = svc.get_invoice(db, invoice_id)
    review_service.apply_review(db, inv, body.action, body.comment, actor_of(settings))
    db.commit()
    db.expire_all()
    return InvoiceDetail.model_validate(svc.get_invoice(db, invoice_id))


@router.get("/{invoice_id}/review-history", response_model=list[ReviewHistoryRead])
def review_history(invoice_id: str, db: DB):
    return [ReviewHistoryRead.model_validate(r) for r in svc.get_invoice(db, invoice_id, include_archived=True).reviews]
