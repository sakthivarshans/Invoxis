"""TEST-ONLY dev server: real FastAPI + real SQLite + real PDF handling, but Groq is replaced by a
deterministic extractor that reads values from the PDF text layer. Used to exercise the frontend service
layer end-to-end without an API key. Never use for real extraction.

    python -m app.tests.e2e_server   (env: DATABASE_URL, UPLOAD_DIR, PORT)
"""
import os
import re

import uvicorn

os.environ.setdefault("GROQ_API_KEY", "e2e-fake")
os.environ.setdefault("GROQ_MODEL", "e2e-fake-model")

from app.services import invoice_extraction as ex  # noqa: E402


class TextLayerExtractor:
    def extract(self, content):
        t = content.full_text
        g = lambda pat: (m.group(1) if (m := re.search(pat, t)) else None)
        total = g(r"Total (\d+\.\d\d)")
        return ex.GInvoice(
            invoice_number=g(r"Invoice No: (\S+)"), invoice_date=g(r"Invoice Date: (\S+)"),
            due_date=g(r"Due Date: (\S+)"), vendor_name="ACME Supplies Ltd", vendor_tax_id=g(r"VAT: (\S+)"),
            currency_code="USD", subtotal=g(r"Subtotal (\d+\.\d\d)"), tax_amount=g(r"Tax (\d+\.\d\d)"),
            grand_total=total,
            line_items=[ex.GLineItem(description="Widget", quantity="2", unit_price="50.00", line_total="100.00")])


ex.get_extractor = lambda settings: TextLayerExtractor()

if __name__ == "__main__":
    from app.main import app
    uvicorn.run(app, host="127.0.0.1", port=int(os.environ.get("PORT", "8000")), log_level="warning")
