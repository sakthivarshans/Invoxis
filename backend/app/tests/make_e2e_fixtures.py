"""Generate the synthetic invoice PDFs used by the frontend e2e check: python -m app.tests.make_e2e_fixtures DIR"""
import pathlib
import sys

from app.tests.conftest import text_pdf

out = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "/tmp/e2e")
out.mkdir(parents=True, exist_ok=True)
common = ["ACME Supplies Ltd", "Due Date: 2025-03-31", "Widget qty 2 unit 50.00", "Subtotal 100.00", "Tax 10.00"]
(out / "good.pdf").write_bytes(text_pdf(["Invoice No: E2E-001", "Invoice Date: 2025-03-01", *common, "Total 110.00", "VAT: GB1"]))
(out / "bad.pdf").write_bytes(text_pdf(["Invoice No: E2E-002", "Invoice Date: 2025-03-02", *common, "Total 150.00", "VAT: GB1"]))
(out / "notpdf.pdf").write_bytes(b"this is not a pdf")
print(f"fixtures written to {out}")
