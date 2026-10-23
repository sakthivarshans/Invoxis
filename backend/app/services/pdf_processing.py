"""Safe PDF intake, storage and inspection (PyMuPDF). Uploaded files are never executed or trusted."""
from __future__ import annotations

import base64
import hashlib
import io
import logging
import re
import uuid
from dataclasses import dataclass, field
from pathlib import Path

import pymupdf  # PyMuPDF
from PIL import Image

from app.core.config import Settings
from app.core.errors import FileValidationError, NotFoundError, PayloadTooLargeError

log = logging.getLogger("invoxis.pdf")
_STORED_NAME = re.compile(r"^[0-9a-f]{32}\.pdf$")
ALLOWED_MIME = {"application/pdf", "application/x-pdf", "application/octet-stream"}  # octet-stream: some browsers


@dataclass
class PdfInfo:
    page_count: int
    sha256: str
    size: int
    is_encrypted: bool = False


def sanitize_filename(name: str | None) -> str:
    """Display-only. The stored name is always server-generated; this never touches the filesystem."""
    base = (name or "document.pdf").replace("\\", "/").split("/")[-1]
    base = re.sub(r"[\x00-\x1f\x7f]", "", base).strip()
    return (base or "document.pdf")[:255]


def validate_upload(filename: str | None, content_type: str | None, data: bytes,
                    settings: Settings) -> PdfInfo:
    """Raises FileValidationError / PayloadTooLargeError. Trusts content, not the filename."""
    name = sanitize_filename(filename)
    if not name.lower().endswith(".pdf"):
        raise FileValidationError("Only .pdf files are accepted.", code="unsupported_file_type")
    if content_type and content_type.split(";")[0].strip().lower() not in ALLOWED_MIME:
        raise FileValidationError(f"Unsupported content type '{content_type}'. Only PDF is accepted.",
                                  code="unsupported_file_type")
    if len(data) == 0:
        raise FileValidationError("The file is empty.", code="empty_file")
    if len(data) > settings.max_upload_bytes:
        raise PayloadTooLargeError(
            f"File exceeds the {settings.max_upload_size_mb} MB limit.", code="file_too_large")
    if b"%PDF-" not in data[:1024]:
        raise FileValidationError("File content is not a PDF (missing %PDF- signature).",
                                  code="invalid_pdf_signature")
    try:
        doc = pymupdf.open(stream=data, filetype="pdf")
    except Exception as exc:  # fitz raises several types for malformed input
        log.info("PDF rejected as unreadable: %s", type(exc).__name__)
        raise FileValidationError("The PDF is corrupted or unreadable.", code="corrupted_pdf") from exc
    try:
        if doc.needs_pass or doc.is_encrypted:
            raise FileValidationError(
                "Password-protected / encrypted PDFs are not supported. Upload an unlocked copy.",
                code="encrypted_pdf")
        if doc.page_count < 1:
            raise FileValidationError("The PDF has no pages.", code="corrupted_pdf")
        if doc.page_count > settings.max_pdf_pages:
            raise FileValidationError(
                f"PDF has {doc.page_count} pages; the limit is {settings.max_pdf_pages}.",
                code="too_many_pages")
        return PdfInfo(page_count=doc.page_count, sha256=hashlib.sha256(data).hexdigest(), size=len(data))
    finally:
        doc.close()


# ------------------------------------------------------------------------------- storage
def save_upload(data: bytes, settings: Settings) -> str:
    """Write to the upload dir under a server-generated name; returns that name."""
    root = settings.upload_path
    root.mkdir(parents=True, exist_ok=True)
    stored = f"{uuid.uuid4().hex}.pdf"
    target = root / stored
    with open(target, "xb") as fh:  # 'x': never overwrite
        fh.write(data)
    return stored


def resolve_stored_path(stored_filename: str, settings: Settings) -> Path:
    """Map a DB-held stored name to a path, refusing anything outside the upload directory."""
    if not _STORED_NAME.match(stored_filename or ""):
        raise NotFoundError("Stored file not found.", code="file_not_found")
    root = settings.upload_path.resolve()
    path = (root / stored_filename).resolve()
    if path.parent != root or not path.is_file():
        raise NotFoundError("Stored file not found.", code="file_not_found")
    return path


# ------------------------------------------------------------------------------ analysis
@dataclass
class PdfContent:
    page_count: int
    page_texts: list[str]
    is_text_based: bool
    images: list[bytes] = field(default_factory=list)   # JPEG bytes, only when not text-based
    truncated_pages: bool = False                        # scanned doc had more pages than could be sent
    text_truncated: bool = False                         # text layer exceeded the prompt budget

    @property
    def full_text(self) -> str:
        return "\n".join(self.page_texts)


def _b64_size(n: int) -> int:
    return ((n + 2) // 3) * 4


def _render_jpegs(doc, count: int, settings: Settings) -> list[bytes]:
    """Render pages to JPEG, lowering resolution/quality until the combined base64 payload fits the budget
    (the provider caps requests carrying inline images at ~4 MB)."""
    budget = int(settings.max_image_payload_mb * 1024 * 1024)
    smallest = None
    for dpi, quality in ((settings.render_dpi, 80), (min(settings.render_dpi, 120), 70),
                         (min(settings.render_dpi, 96), 60), (72, 55)):
        out: list[bytes] = []
        for i in range(count):
            # get_pixmap renders with the page's /Rotate applied, i.e. as displayed.
            pix = doc[i].get_pixmap(dpi=dpi, alpha=False)
            img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
            buf = io.BytesIO()
            img.save(buf, format="JPEG", quality=quality, optimize=True)
            out.append(buf.getvalue())
        total = sum(_b64_size(len(b)) for b in out)
        smallest = (total, out)
        if total <= budget:
            return out
    raise FileValidationError(
        f"The scanned pages are too large to send for extraction even at reduced quality "
        f"({smallest[0] // 1024} KB > {budget // 1024} KB). Use a smaller or lower-resolution scan.",
        code="scan_too_large")


def analyse_pdf(path: Path, settings: Settings) -> PdfContent:
    """Extract the text layer; if it's too thin (scanned), render pages to images instead."""
    try:
        doc = pymupdf.open(path)
    except Exception as exc:
        raise FileValidationError("The stored PDF could not be opened.", code="corrupted_pdf") from exc
    try:
        if doc.needs_pass:
            raise FileValidationError("PDF is encrypted.", code="encrypted_pdf")
        texts = [doc[i].get_text("text") for i in range(doc.page_count)]
        useful = sum(1 for t in texts if len(t.strip()) >= settings.min_text_chars_per_page)
        text_based = useful >= max(1, (doc.page_count + 1) // 2)   # at least half the pages carry text
        content = PdfContent(page_count=doc.page_count, page_texts=texts, is_text_based=text_based)
        if text_based:
            remaining = settings.max_prompt_chars       # keep early pages whole; never cut mid-page silently
            trimmed: list[str] = []
            for t in texts:
                if remaining <= 0:
                    content.text_truncated = True
                    trimmed.append("")
                elif len(t) > remaining:
                    content.text_truncated = True
                    trimmed.append(t[:remaining])
                    remaining = 0
                else:
                    trimmed.append(t)
                    remaining -= len(t)
            content.page_texts = trimmed
        else:
            limit = min(doc.page_count, settings.groq_max_images)
            content.truncated_pages = doc.page_count > limit
            content.images = _render_jpegs(doc, limit, settings)
        return content
    finally:
        doc.close()
