"""Shared fixtures. Tests never call the real Groq API: extraction is replaced by a fake."""
import io
from decimal import Decimal

import pymupdf
import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.core.config import Settings
from app.db import session as dbsession
from app.main import create_app
from app.services import invoice_extraction as ex


def make_settings(tmp_path, **over) -> Settings:
    base = dict(
        _env_file=None, app_env="test", database_url=f"sqlite:///{tmp_path / 'test.db'}",
        upload_dir=str(tmp_path / "uploads"), job_execution_mode="inline",
        groq_api_key="test-key", groq_model="test-model", max_upload_size_mb=1, max_pdf_pages=5,
    )
    base.update(over)
    return Settings(**base)


@pytest.fixture
def settings(tmp_path):
    return make_settings(tmp_path)


@pytest.fixture
def client(settings):
    engine = dbsession.init_engine(dbsession.make_engine(settings))
    app = create_app(settings)
    with TestClient(app) as c:
        c.settings = settings
        yield c
    engine.dispose()


@pytest.fixture
def unconfigured_client(tmp_path):
    s = make_settings(tmp_path, groq_api_key="", groq_model="")
    engine = dbsession.init_engine(dbsession.make_engine(s))
    with TestClient(create_app(s)) as c:
        c.settings = s
        yield c
    engine.dispose()


# ----------------------------------------------------------------------- synthetic PDFs
def text_pdf(lines: list[str] | None = None, pages: int = 1) -> bytes:
    lines = lines or [
        "ACME Supplies Ltd", "Invoice No: INV-1001", "Invoice Date: 2025-03-01", "Due Date: 2025-03-31",
        "Widget  qty 2  unit 50.00  total 100.00", "Subtotal 100.00", "Tax 10.00", "Total 110.00",
        "Currency: USD", "Bill to: Globex", "Vendor VAT: GB123456789", "Discount 0.00", "Shipping 0.00",
        "Rate 10%",
    ]
    doc = pymupdf.open()
    for _ in range(pages):
        page = doc.new_page()
        y = 72
        for ln in lines:
            page.insert_text((72, y), ln, fontsize=11)
            y += 18
    data = doc.tobytes()
    doc.close()
    return data


def scanned_pdf() -> bytes:
    """A page that is only an image (no text layer)."""
    img = Image.new("RGB", (400, 300), "white")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    doc = pymupdf.open()
    page = doc.new_page()
    page.insert_image(page.rect, stream=buf.getvalue())
    data = doc.tobytes()
    doc.close()
    return data


def encrypted_pdf() -> bytes:
    doc = pymupdf.open()
    doc.new_page().insert_text((72, 72), "secret")
    data = doc.tobytes(encryption=pymupdf.PDF_ENCRYPT_AES_256, owner_pw="o", user_pw="u")
    doc.close()
    return data


@pytest.fixture
def pdf_bytes():
    return text_pdf()


# --------------------------------------------------------------------- fake extractor
def good_invoice(**over) -> ex.GInvoice:
    base = dict(
        invoice_number="INV-1001", invoice_date="2025-03-01", due_date="2025-03-31",
        vendor_name="ACME Supplies Ltd", vendor_tax_id="GB123456789", customer_name="Globex",
        currency_code="USD", subtotal="100.00", tax_amount="10.00", discount="0.00",
        shipping_charges="0.00", grand_total="110.00",
        line_items=[ex.GLineItem(description="Widget", quantity="2", unit_price="50.00", line_total="100.00",
                                 tax_rate_percent="10")],
    )
    base.update(over)
    return ex.GInvoice(**base)


class FakeExtractor:
    def __init__(self, result=None, error: Exception | None = None):
        self.result, self.error, self.calls = result or good_invoice(), error, 0

    def extract(self, content):
        self.calls += 1
        if self.error:
            raise self.error
        return self.result


@pytest.fixture
def fake_extractor(monkeypatch):
    fake = FakeExtractor()
    monkeypatch.setattr(ex, "get_extractor", lambda settings: fake)
    return fake


def upload(client, data: bytes, name="inv.pdf", ctype="application/pdf"):
    return client.post("/api/v1/documents/upload", files=[("files", (name, data, ctype))])
