"""Document intake, persistent job model and the extraction pipeline.

Worker model (deliberately simple, college-scale): jobs are rows in `processing_jobs`; an in-process
ThreadPoolExecutor executes them. On startup, jobs left in 'processing' (crash/restart) are re-queued and
all queued jobs are resubmitted. LIMITATIONS: single process only (no cross-process locking beyond the
atomic status claim), no automatic retry/backoff, and in-flight Groq calls are lost on restart (then
re-run). Use a real queue (e.g. a Redis-backed worker) if you need multiple API processes.
"""
from __future__ import annotations

import logging
from concurrent.futures import ThreadPoolExecutor

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.errors import AppError, ConflictError, ExtractionConfigError, FileValidationError
from app.db import session as dbsession
from app.db.models import (ExtractionResult, Invoice, InvoiceLineItem, ProcessingJob, SourceDocument,
                           utcnow)
from app.services import audit_service, invoice_extraction as ex, pdf_processing as pdfp
from app.services.invoice_service import run_validation

log = logging.getLogger("invoxis.jobs")
ACTIVE = ("queued", "processing")


# ------------------------------------------------------------------------------ intake
def create_document(db: Session, filename: str, content_type: str | None, data: bytes,
                    settings: Settings, actor: str) -> tuple[SourceDocument, Invoice, ProcessingJob]:
    info = pdfp.validate_upload(filename, content_type, data, settings)

    dup = db.scalars(select(SourceDocument).join(Invoice, Invoice.document_id == SourceDocument.id)
                     .where(SourceDocument.sha256 == info.sha256, Invoice.is_archived.is_(False))).first()
    if dup is not None:
        raise ConflictError("An identical file has already been uploaded.", code="duplicate_upload",
                            details={"document_id": dup.id,
                                     "invoice_id": dup.invoice.id if dup.invoice else None})

    stored = pdfp.save_upload(data, settings)
    try:
        doc = SourceDocument(original_filename=pdfp.sanitize_filename(filename), stored_filename=stored,
                             size_bytes=info.size, sha256=info.sha256, page_count=info.page_count,
                             status="queued")
        inv = Invoice(processing_status="queued", document=doc)
        job = ProcessingJob(document=doc, status="queued", attempt=1)
        db.add_all([doc, inv, job])
        db.flush()
        audit_service.record(
            db, action="DOCUMENT_UPLOADED", category="upload", actor=actor, invoice=inv,
            description=f"Document '{doc.original_filename}' uploaded ({info.size} bytes, "
                        f"{info.page_count} page(s)).",
            details={"document_id": doc.id, "sha256": info.sha256})
        return doc, inv, job
    except Exception:
        (settings.upload_path / stored).unlink(missing_ok=True)  # no orphan file if the DB write fails
        raise


def latest_job(doc: SourceDocument) -> ProcessingJob | None:
    return doc.jobs[-1] if doc.jobs else None


def _new_attempt(db: Session, doc: SourceDocument, actor: str, why: str) -> ProcessingJob:
    prev = latest_job(doc)
    job = ProcessingJob(document=doc, status="queued", attempt=(prev.attempt + 1) if prev else 1)
    db.add(job)
    doc.status, doc.error_code, doc.error_message = "queued", None, None
    if doc.invoice:
        doc.invoice.processing_status = "queued"
        doc.invoice.error_message = None
    db.flush()
    audit_service.record(
        db, action="EXTRACTION_REQUESTED", category="extraction", actor=actor, invoice=doc.invoice,
        description=f"Extraction requested ({why}); attempt {job.attempt}.",
        details={"document_id": doc.id, "job_id": job.id})
    return job


def request_extraction(db: Session, doc: SourceDocument, settings: Settings, actor: str, *,
                       mode: str = "extract", force: bool = False) -> tuple[ProcessingJob, bool]:
    """Return (job, created). Idempotent: an already-active job is returned rather than duplicated."""
    prev = latest_job(doc)
    if prev and prev.status in ACTIVE:
        return prev, False
    if mode == "retry" and (prev is None or prev.status != "failed"):
        raise ConflictError("Only a failed document can be retried.", code="not_retryable")
    if mode == "extract" and prev and prev.status != "failed":
        raise ConflictError("This document has already been extracted. Use reprocess to run it again.",
                            code="already_extracted")
    inv = doc.invoice
    if mode == "reprocess" and inv is not None:
        if inv.review_status == "approved":
            raise ConflictError("Approved invoices are locked; re-open for review before reprocessing.",
                                code="invoice_locked")
        if inv.is_manually_edited and not force:
            raise ConflictError(
                "Reprocessing would overwrite manual corrections. Pass force=true to confirm "
                "(the previous extraction and edit history are retained).", code="edits_would_be_lost")
    if not settings.extraction_configured:  # fail clearly, change nothing
        ex.get_extractor(settings)       # raises ExtractionConfigError
    return _new_attempt(db, doc, actor, mode), True


# ---------------------------------------------------------------------------- execution
class JobRunner:
    def __init__(self) -> None:
        self._pool: ThreadPoolExecutor | None = None

    def submit(self, job_id: str, settings: Settings) -> None:
        if settings.job_execution_mode == "inline":
            run_job(job_id, settings)
            return
        if self._pool is None:
            self._pool = ThreadPoolExecutor(max_workers=settings.job_workers,
                                            thread_name_prefix="invoxis-job")
        self._pool.submit(run_job, job_id, settings)

    def shutdown(self) -> None:
        if self._pool:
            self._pool.shutdown(wait=False, cancel_futures=True)
            self._pool = None


runner = JobRunner()


def recover_jobs(settings: Settings) -> int:
    """Startup: re-queue interrupted jobs, then resubmit everything queued."""
    with dbsession.session_factory()() as db:
        db.execute(update(ProcessingJob).where(ProcessingJob.status == "processing")
                   .values(status="queued", started_at=None))
        db.commit()
        ids = list(db.scalars(select(ProcessingJob.id).where(ProcessingJob.status == "queued")
                              .order_by(ProcessingJob.created_at)))
    for jid in ids:
        runner.submit(jid, settings)
    return len(ids)


def enqueue(job_id: str, settings: Settings) -> None:
    """Called AFTER the request transaction has committed."""
    if not settings.extraction_configured:
        # Fail fast and visibly rather than leaving the job 'queued' forever.
        with dbsession.session_factory()() as db:
            try:
                ex.get_extractor(settings)
            except ExtractionConfigError as e:
                _persist_failure(db, job_id, e.code, e.message)
        return
    runner.submit(job_id, settings)


def _claim(db: Session, job_id: str) -> ProcessingJob | None:
    """Atomically move queued -> processing; returns None if another worker already took it."""
    res = db.execute(update(ProcessingJob)
                     .where(ProcessingJob.id == job_id, ProcessingJob.status == "queued")
                     .values(status="processing", started_at=utcnow()))
    db.commit()
    if res.rowcount != 1:
        return None
    job = db.get(ProcessingJob, job_id)
    job.document.status = "processing"
    if job.document.invoice:
        job.document.invoice.processing_status = "processing"
    db.commit()
    return job


def run_job(job_id: str, settings: Settings) -> None:
    """Never raises: every outcome is recorded on the job/document/invoice rows."""
    with dbsession.session_factory()() as db:
        job = _claim(db, job_id)
        if job is None:
            return
        doc_id = job.document_id
        try:
            extractor = ex.get_extractor(settings)
            doc = db.get(SourceDocument, doc_id)
            path = pdfp.resolve_stored_path(doc.stored_filename, settings)
            content = pdfp.analyse_pdf(path, settings)
            g = extractor.extract(content)
            norm = ex.normalise(g, content,
                                settings.groq_model if content.is_text_based else settings.vision_model)
            _persist_success(db, job_id, norm, settings)
            db.commit()
        except ex.ExtractionError as e:
            db.rollback()
            _persist_failure(db, job_id, e.code, e.message)
        except (ExtractionConfigError, FileValidationError, AppError) as e:
            db.rollback()
            _persist_failure(db, job_id, e.code, e.message)
        except Exception as e:  # noqa: BLE001 - last resort; recorded, never swallowed silently
            db.rollback()
            log.exception("Unexpected failure in job %s", job_id)
            _persist_failure(db, job_id, "internal_error",
                             f"Unexpected processing error ({type(e).__name__}). See server logs.")


def _persist_success(db: Session, job_id: str, norm: ex.NormalizedExtraction, settings: Settings) -> None:
    job = db.get(ProcessingJob, job_id)
    doc = job.document
    inv = doc.invoice
    for k, v in norm.header.items():
        setattr(inv, k, v)
    inv.line_items = [InvoiceLineItem(position=i, **row) for i, row in enumerate(norm.line_items)]
    inv.field_warnings = norm.field_warnings or None
    inv.field_evidence = norm.field_evidence or None
    inv.is_manually_edited = False
    inv.error_message = None
    inv.version += 1
    run_no = (db.scalar(select(func.max(ExtractionResult.run_number))
                        .where(ExtractionResult.invoice_id == inv.id)) or 0) + 1
    db.add(ExtractionResult(invoice_id=inv.id, document_id=doc.id, run_number=run_no, model=norm.model,
                            input_mode=norm.input_mode, pages_sent=norm.pages_sent,
                            raw_output=norm.raw_output, warnings=norm.warnings or None))
    inv.processing_status = "completed"  # run_validation refines this to needs_review if findings exist
    doc.error_code = doc.error_message = None
    db.flush()
    db.refresh(inv, ["line_items", "issues"])
    audit_service.record(
        db, action="EXTRACTION_COMPLETED", category="extraction", actor="extraction-pipeline", invoice=inv,
        description=f"Extraction run {run_no} completed for '{doc.original_filename}' "
                    f"({norm.input_mode} input, model {norm.model}).",
        details={"run_number": run_no, "model": norm.model, "input_mode": norm.input_mode,
                 "line_items": len(norm.line_items), "flagged_fields": sorted(norm.field_warnings),
                 "warnings": norm.warnings})
    run_validation(db, inv, settings, actor="validation-engine")
    doc.status = inv.processing_status
    job.status = inv.processing_status
    job.finished_at = utcnow()
    job.error_code = job.error_message = None


def _persist_failure(db: Session, job_id: str, code: str, message: str) -> None:
    job = db.get(ProcessingJob, job_id)
    doc = job.document
    job.status, job.error_code, job.error_message, job.finished_at = "failed", code, message, utcnow()
    doc.status, doc.error_code, doc.error_message = "failed", code, message
    if doc.invoice:
        doc.invoice.processing_status = "failed"
        doc.invoice.error_message = message
        audit_service.record(
            db, action="EXTRACTION_FAILED", category="extraction", actor="extraction-pipeline",
            invoice=doc.invoice, description=f"Extraction failed ({code}): {message}",
            details={"job_id": job_id, "code": code})
    db.commit()
    log.warning("Job %s failed: %s", job_id, code)
