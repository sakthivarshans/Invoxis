from typing import Literal

from fastapi import APIRouter, File, Query, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.api.deps import DB, SettingsDep, actor_of
from app.core.errors import AppError, FileValidationError, NotFoundError, PayloadTooLargeError
from app.db.models import SourceDocument
from app.schemas.common import Page
from app.schemas.workflow import (DocumentDetail, DocumentRead, DocumentStatus, UploadItemResult,
                                  UploadResponse)
from app.services import pdf_processing as pdfp, processing_service as proc

router = APIRouter(prefix="/documents", tags=["documents"])


def _doc(db, document_id: str) -> SourceDocument:
    doc = db.scalars(select(SourceDocument).where(SourceDocument.id == document_id).options(
        selectinload(SourceDocument.jobs), selectinload(SourceDocument.invoice))).first()
    if doc is None:
        raise NotFoundError(f"Document '{document_id}' was not found.", code="document_not_found")
    return doc


def _read(doc: SourceDocument) -> DocumentRead:
    r = DocumentRead.model_validate(doc)
    r.invoice_id = doc.invoice.id if doc.invoice else None
    return r


def _status(doc: SourceDocument) -> DocumentStatus:
    j = proc.latest_job(doc)
    return DocumentStatus(document_id=doc.id, invoice_id=doc.invoice.id if doc.invoice else None,
                          status=doc.status, error_code=doc.error_code, error_message=doc.error_message,
                          attempt=j.attempt if j else None)


@router.post("/upload", response_model=UploadResponse, status_code=202)
def upload(db: DB, settings: SettingsDep, files: list[UploadFile] = File(...)):
    """Accepts one or more PDFs. Each file is validated and stored independently; a bad file never
    blocks the others. Extraction runs in the background - poll /documents/{id}/status."""
    if len(files) > 20:
        raise AppError("At most 20 files per request.", code="too_many_files", status_code=422)
    results: list[UploadItemResult] = []
    errors: list[AppError] = []
    for f in files:
        name = pdfp.sanitize_filename(f.filename)
        try:
            data = f.file.read(settings.max_upload_bytes + 1)   # bounded read: never buffer unbounded input
            if len(data) > settings.max_upload_bytes:
                raise PayloadTooLargeError(f"File exceeds the {settings.max_upload_size_mb} MB limit.")
            doc, inv, job = proc.create_document(db, name, f.content_type, data, settings, actor_of(settings))
            db.commit()  # persist before the worker (separate session) can see the job
            proc.enqueue(job.id, settings)
            db.expire_all()
            fresh = _doc(db, doc.id)
            results.append(UploadItemResult(filename=name, accepted=True, document_id=doc.id,
                                            invoice_id=inv.id, status=fresh.status,
                                            error_code=fresh.error_code, error_message=fresh.error_message))
        except AppError as e:
            db.rollback()
            errors.append(e)
            results.append(UploadItemResult(filename=name, accepted=False, error_code=e.code,
                                            error_message=e.message))
    if not any(r.accepted for r in results):
        if len(errors) == 1:
            raise errors[0]
        raise AppError("None of the files could be accepted.", code="no_files_accepted", status_code=422,
                       details=[r.model_dump(include={"filename", "error_code", "error_message"}) for r in results])
    return UploadResponse(results=results)


@router.get("", response_model=Page[DocumentRead])
def list_documents(db: DB, page: int = Query(1, ge=1), page_size: int = Query(25, ge=1, le=200),
                   status: Literal["queued", "processing", "completed", "needs_review", "failed"] | None = None):
    where = [SourceDocument.status == status] if status else []
    total = db.scalar(select(func.count()).select_from(SourceDocument).where(*where)) or 0
    docs = db.scalars(select(SourceDocument).where(*where).options(selectinload(SourceDocument.invoice))
                      .order_by(SourceDocument.created_at.desc()).offset((page - 1) * page_size)
                      .limit(page_size)).all()
    return Page(items=[_read(d) for d in docs], total=total, page=page, page_size=page_size)


@router.get("/{document_id}", response_model=DocumentDetail)
def get_document(document_id: str, db: DB):
    doc = _doc(db, document_id)
    d = DocumentDetail.model_validate(doc)
    d.invoice_id = doc.invoice.id if doc.invoice else None
    return d


@router.get("/{document_id}/status", response_model=DocumentStatus)
def get_status(document_id: str, db: DB):
    return _status(_doc(db, document_id))


def _start(db, settings, document_id: str, mode: str, force: bool = False) -> DocumentStatus:
    doc = _doc(db, document_id)
    job, created = proc.request_extraction(db, doc, settings, actor_of(settings), mode=mode, force=force)
    db.commit()
    if created:
        proc.enqueue(job.id, settings)
    db.expire_all()
    return _status(_doc(db, document_id))


@router.post("/{document_id}/extract", response_model=DocumentStatus, status_code=202)
def extract(document_id: str, db: DB, settings: SettingsDep):
    return _start(db, settings, document_id, "extract")


@router.post("/{document_id}/retry", response_model=DocumentStatus, status_code=202)
def retry(document_id: str, db: DB, settings: SettingsDep):
    return _start(db, settings, document_id, "retry")


@router.get("/{document_id}/file")
def get_file(document_id: str, db: DB, settings: SettingsDep):
    """Serves the PDF for a *known* document record only. The path comes from the DB-held,
    server-generated name and is re-validated to lie inside the upload directory."""
    doc = _doc(db, document_id)
    path = pdfp.resolve_stored_path(doc.stored_filename, settings)
    safe = pdfp.sanitize_filename(doc.original_filename).replace('"', "")
    return FileResponse(path, media_type="application/pdf",
                        headers={"Content-Disposition": f'inline; filename="{safe}"',
                                 "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store"})
