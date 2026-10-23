import os

from app.services import invoice_extraction as ex
from app.tests.conftest import FakeExtractor, encrypted_pdf, good_invoice, scanned_pdf, text_pdf, upload


def test_startup_creates_schema_and_dirs(client):
    assert client.get("/api/v1/invoices").json() == {"items": [], "total": 0, "page": 1, "page_size": 25}
    assert client.settings.upload_path.exists()


def test_upload_happy_path_stores_server_named_file(client, fake_extractor, pdf_bytes):
    r = upload(client, pdf_bytes, name="../../etc/passwd.pdf")
    res = r.json()["results"][0]
    assert r.status_code == 202 and res["filename"] == "passwd.pdf"
    files = os.listdir(client.settings.upload_path)
    assert len(files) == 1 and files[0].endswith(".pdf") and "passwd" not in files[0]
    doc = client.get(f"/api/v1/documents/{res['document_id']}").json()
    assert "stored_filename" not in doc and "path" not in str(doc).lower().replace("passwd", "")
    assert doc["page_count"] == 1 and doc["jobs"][0]["attempt"] == 1


def test_rejects_non_pdf_extension(client, fake_extractor):
    r = upload(client, b"hello", name="a.txt", ctype="text/plain")
    assert r.status_code == 422 and r.json()["error"]["code"] == "unsupported_file_type"


def test_rejects_wrong_mime(client, fake_extractor, pdf_bytes):
    assert upload(client, pdf_bytes, ctype="image/png").json()["error"]["code"] == "unsupported_file_type"


def test_rejects_fake_pdf_by_signature(client, fake_extractor):
    assert upload(client, b"MZ\x90 not a pdf at all").json()["error"]["code"] == "invalid_pdf_signature"


def test_rejects_empty_corrupt_encrypted_and_too_many_pages(client, fake_extractor):
    assert upload(client, b"").json()["error"]["code"] == "empty_file"
    assert upload(client, b"%PDF-1.7\ngarbage garbage").json()["error"]["code"] == "corrupted_pdf"
    assert upload(client, encrypted_pdf()).json()["error"]["code"] == "encrypted_pdf"
    assert upload(client, text_pdf(pages=6)).json()["error"]["code"] == "too_many_pages"
    assert os.listdir(client.settings.upload_path) == []   # nothing stored for rejected files


def test_enforces_size_limit(client, fake_extractor):
    big = b"%PDF-1.4\n" + b"0" * (1024 * 1024 + 10)
    r = upload(client, big)
    assert r.status_code == 413 and r.json()["error"]["code"] == "file_too_large"


def test_duplicate_upload_rejected_with_reference(client, fake_extractor, pdf_bytes):
    first = upload(client, pdf_bytes).json()["results"][0]
    r = upload(client, pdf_bytes, name="again.pdf")
    assert r.status_code == 409 and r.json()["error"]["code"] == "duplicate_upload"
    assert r.json()["error"]["details"]["document_id"] == first["document_id"]
    assert len(client.get("/api/v1/documents").json()["items"]) == 1


def test_batch_upload_partial_success(client, fake_extractor, pdf_bytes):
    r = client.post("/api/v1/documents/upload", files=[
        ("files", ("ok.pdf", pdf_bytes, "application/pdf")), ("files", ("bad.pdf", b"nope", "application/pdf"))])
    res = r.json()["results"]
    assert r.status_code == 202 and [x["accepted"] for x in res] == [True, False]


def test_error_envelope_has_request_id(client):
    r = client.get("/api/v1/documents/doc-nope")
    e = r.json()["error"]
    assert r.status_code == 404 and e["code"] == "document_not_found" and e["request_id"]
    assert r.headers["X-Request-ID"] == e["request_id"]


def test_file_served_only_for_known_document(client, fake_extractor, pdf_bytes):
    doc_id = upload(client, pdf_bytes).json()["results"][0]["document_id"]
    r = client.get(f"/api/v1/documents/{doc_id}/file")
    assert r.status_code == 200 and r.content == pdf_bytes and r.headers["content-type"] == "application/pdf"
    assert r.headers["x-content-type-options"] == "nosniff"
    for bad in ("doc-unknown", "..%2F..%2Fetc%2Fpasswd", "%2e%2e"):
        assert client.get(f"/api/v1/documents/{bad}/file").status_code == 404


def test_stored_path_traversal_is_refused(client, settings):
    from app.core.errors import NotFoundError
    from app.services.pdf_processing import resolve_stored_path
    import pytest
    for name in ("../x.pdf", "/etc/passwd", "a" * 32 + ".pdf", "..\\x.pdf", ""):
        with pytest.raises(NotFoundError):
            resolve_stored_path(name, settings)


# ------------------------------------------------------------------- extraction behaviour
def test_missing_groq_key_keeps_document_and_reports_clear_error(unconfigured_client, pdf_bytes):
    c = unconfigured_client
    r = upload(c, pdf_bytes)
    res = r.json()["results"][0]
    assert r.status_code == 202 and res["status"] == "failed" and res["error_code"] == "extraction_not_configured"
    assert "GROQ_API_KEY" in res["error_message"]
    assert os.listdir(c.settings.upload_path)                          # file preserved
    inv = c.get(f"/api/v1/invoices/{res['invoice_id']}").json()
    assert inv["processing_status"] == "failed" and inv["invoice_number"] is None   # no fabricated data
    r2 = c.post(f"/api/v1/documents/{res['document_id']}/retry")
    assert r2.status_code == 503 and r2.json()["error"]["code"] == "extraction_not_configured"
    assert c.get("/api/v1/health").json()["extraction"]["configured"] is False
    assert c.get("/api/v1/invoices").status_code == 200                # app keeps working


def test_extraction_populates_invoice_and_validates(client, fake_extractor, pdf_bytes):
    res = upload(client, pdf_bytes).json()["results"][0]
    inv = client.get(f"/api/v1/invoices/{res['invoice_id']}").json()
    assert inv["processing_status"] == "completed" and inv["validation_status"] == "valid"
    assert inv["currency"] == "USD" and inv["line_items"][0]["line_total"] == "100.0000"
    ext = client.get(f"/api/v1/invoices/{res['invoice_id']}/extraction").json()
    assert ext["run_number"] == 1 and ext["model"] == "test-model" and ext["input_mode"] == "text"


def test_scanned_pdf_uses_image_mode(client, fake_extractor):
    res = upload(client, scanned_pdf()).json()["results"][0]
    ext = client.get(f"/api/v1/invoices/{res['invoice_id']}/extraction").json()
    assert ext["input_mode"] == "images" and any("Scanned" in w for w in ext["warnings"])


def test_inconsistent_totals_do_not_fail_processing(client, monkeypatch, pdf_bytes):
    monkeypatch.setattr(ex, "get_extractor", lambda s: FakeExtractor(good_invoice(grand_total="150.00")))
    res = upload(client, pdf_bytes).json()["results"][0]
    inv = client.get(f"/api/v1/invoices/{res['invoice_id']}").json()
    assert inv["processing_status"] == "needs_review" and inv["validation_status"] == "critical"
    assert inv["grand_total"] == "150.0000"      # extracted value kept, never "corrected"


def test_malformed_model_output_marks_failed_then_retry_succeeds_without_duplicates(client, monkeypatch, pdf_bytes):
    bad = FakeExtractor(error=ex.ExtractionError("invalid_model_output", "bad json", True))
    monkeypatch.setattr(ex, "get_extractor", lambda s: bad)
    res = upload(client, pdf_bytes).json()["results"][0]
    assert res["status"] == "failed" and res["error_code"] == "invalid_model_output"
    assert client.post(f"/api/v1/documents/{res['document_id']}/retry").json()["status"] == "failed"
    good = FakeExtractor()
    monkeypatch.setattr(ex, "get_extractor", lambda s: good)
    st = client.post(f"/api/v1/documents/{res['document_id']}/retry").json()
    assert st["status"] == "completed" and st["attempt"] == 3 and st["invoice_id"] == res["invoice_id"]
    assert client.get("/api/v1/invoices").json()["total"] == 1          # no duplicate invoice
    assert len(client.get(f"/api/v1/documents/{res['document_id']}").json()["jobs"]) == 3


def test_retry_rejected_for_healthy_document_and_extract_is_idempotent(client, fake_extractor, pdf_bytes):
    res = upload(client, pdf_bytes).json()["results"][0]
    assert client.post(f"/api/v1/documents/{res['document_id']}/retry").json()["error"]["code"] == "not_retryable"
    assert client.post(f"/api/v1/documents/{res['document_id']}/extract").json()["error"]["code"] == "already_extracted"
    assert fake_extractor.calls == 1


def test_groq_rate_limit_recorded_in_audit(client, monkeypatch, pdf_bytes):
    monkeypatch.setattr(ex, "get_extractor", lambda s: FakeExtractor(error=ex.ExtractionError("groq_rate_limited", "slow down", True)))
    res = upload(client, pdf_bytes).json()["results"][0]
    logs = client.get("/api/v1/audit-logs", params={"invoice_id": res["invoice_id"]}).json()["items"]
    assert any(l["action"] == "EXTRACTION_FAILED" and "groq_rate_limited" in l["description"] for l in logs)


def test_reprocess_requires_force_over_manual_edits_and_keeps_history(client, fake_extractor, pdf_bytes):
    iid = upload(client, pdf_bytes).json()["results"][0]["invoice_id"]
    client.patch(f"/api/v1/invoices/{iid}", json={"vendor_name": "Corrected Vendor"})
    r = client.post(f"/api/v1/invoices/{iid}/reprocess")
    assert r.status_code == 409 and r.json()["error"]["code"] == "edits_would_be_lost"
    r = client.post(f"/api/v1/invoices/{iid}/reprocess", params={"force": True})
    assert r.status_code == 202
    inv = client.get(f"/api/v1/invoices/{iid}").json()
    assert inv["vendor_name"] == "ACME Supplies Ltd" and not inv["is_manually_edited"]
    assert client.get(f"/api/v1/invoices/{iid}/extraction").json()["run_number"] == 2
    edits = client.get("/api/v1/audit-logs", params={"invoice_id": iid, "action": "INVOICE_FIELDS_MODIFIED"}).json()
    assert edits["total"] == 1 and edits["items"][0]["details"]["changes"][0]["new"] == "Corrected Vendor"


def test_recover_jobs_requeues_interrupted_work(client, monkeypatch, pdf_bytes):
    from app.db import session as dbsession
    from app.db.models import ProcessingJob
    from app.services import processing_service as ps
    bad = FakeExtractor(error=ex.ExtractionError("groq_timeout", "t", True))
    monkeypatch.setattr(ex, "get_extractor", lambda s: bad)
    res = upload(client, pdf_bytes).json()["results"][0]
    with dbsession.session_factory()() as db:           # simulate a crash mid-job
        job = db.query(ProcessingJob).one()
        job.status = "processing"
        db.commit()
    monkeypatch.setattr(ex, "get_extractor", lambda s: FakeExtractor())
    assert ps.recover_jobs(client.settings) == 1
    assert client.get(f"/api/v1/documents/{res['document_id']}/status").json()["status"] == "completed"


def test_thread_mode_background_worker_completes_job(tmp_path, monkeypatch, pdf_bytes):
    """Real ThreadPoolExecutor path: a worker thread finishes the job while the API polls its status."""
    import time
    from fastapi.testclient import TestClient
    from app.db import session as dbsession
    from app.main import create_app
    from app.services import processing_service as ps
    from app.tests.conftest import make_settings
    s = make_settings(tmp_path, job_execution_mode="thread")
    engine = dbsession.init_engine(dbsession.make_engine(s))
    monkeypatch.setattr(ex, "get_extractor", lambda settings: FakeExtractor())
    try:
        with TestClient(create_app(s)) as c:
            res = upload(c, pdf_bytes).json()["results"][0]
            deadline = time.time() + 10
            status = res["status"]
            while status not in ("completed", "needs_review", "failed") and time.time() < deadline:
                time.sleep(0.05)
                status = c.get(f"/api/v1/documents/{res['document_id']}/status").json()["status"]
            assert status == "completed"
            assert c.get(f"/api/v1/invoices/{res['invoice_id']}").json()["invoice_number"] == "INV-1001"
    finally:
        ps.runner.shutdown()
        engine.dispose()
