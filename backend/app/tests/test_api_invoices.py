import pytest

from app.tests.conftest import upload

BODY = {"invoice_number": "M-1", "invoice_date": "2025-03-01", "due_date": "2025-03-31", "vendor_name": "Manual Co",
        "vendor_tax_id": "X1", "currency": "usd", "subtotal": "100.00", "tax_amount": "10.00", "discount": "0",
        "shipping_charges": "0", "grand_total": "110.00",
        "line_items": [{"description": "Thing", "quantity": "2", "unit_price": "50", "line_total": "100"}]}


def mk(client, **over):
    r = client.post("/api/v1/invoices", json={**BODY, **over})
    assert r.status_code == 201, r.text
    return r.json()


def test_crud_roundtrip(client):
    inv = mk(client)
    assert inv["currency"] == "USD" and inv["validation_status"] == "valid" and inv["version"] == 1
    got = client.get(f"/api/v1/invoices/{inv['id']}").json()
    assert got["line_items"][0]["quantity"] == "2.000000"
    p = client.patch(f"/api/v1/invoices/{inv['id']}", json={"vendor_name": "Renamed", "expected_version": 1,
                                                          "reason": "typo"})
    assert p.status_code == 200 and p.json()["vendor_name"] == "Renamed" and p.json()["version"] == 2
    assert client.delete(f"/api/v1/invoices/{inv['id']}").status_code == 204
    assert client.get(f"/api/v1/invoices/{inv['id']}").status_code == 404
    assert client.get("/api/v1/invoices").json()["total"] == 0


def test_patch_revalidates_and_never_changes_unrelated_fields(client):
    inv = mk(client)
    p = client.patch(f"/api/v1/invoices/{inv['id']}", json={"grand_total": "999.00"}).json()
    assert p["validation_status"] == "critical" and p["processing_status"] == "needs_review"
    assert p["subtotal"] == "100.0000" and p["tax_amount"] == "10.0000"
    issues = client.get(f"/api/v1/invoices/{inv['id']}/validation").json()
    assert any(i["rule_code"] == "MATH_GRAND_TOTAL_MISMATCH" for i in issues["issues"])
    # fix it: issue disappears from current but is retained as history (resolved)
    client.patch(f"/api/v1/invoices/{inv['id']}", json={"grand_total": "110.00"})
    assert client.get(f"/api/v1/invoices/{inv['id']}/validation").json()["issue_count"] == 0
    hist = client.get("/api/v1/validation/issues", params={"invoice_id": inv["id"], "include_history": True}).json()
    assert hist["total"] == 1 and hist["items"][0]["resolution_status"] == "resolved"


def test_patch_null_clears_and_omitted_is_untouched(client):
    inv = mk(client)
    p = client.patch(f"/api/v1/invoices/{inv['id']}", json={"vendor_tax_id": None}).json()
    assert p["vendor_tax_id"] is None and p["vendor_name"] == "Manual Co"
    assert any(i["rule_code"] == "TAX_VENDOR_ID_MISSING" for i in p["validation_issues"])


def test_noop_patch_does_not_bump_version_or_audit(client):
    inv = mk(client)
    p = client.patch(f"/api/v1/invoices/{inv['id']}", json={"vendor_name": "Manual Co"}).json()
    assert p["version"] == 1
    assert client.get("/api/v1/audit-logs", params={"action": "INVOICE_FIELDS_MODIFIED"}).json()["total"] == 0


def test_version_conflict(client):
    inv = mk(client)
    client.patch(f"/api/v1/invoices/{inv['id']}", json={"vendor_name": "A"})
    r = client.patch(f"/api/v1/invoices/{inv['id']}", json={"vendor_name": "B", "expected_version": 1})
    assert r.status_code == 409 and r.json()["error"]["code"] == "version_conflict"
    assert client.get(f"/api/v1/invoices/{inv['id']}").json()["vendor_name"] == "A"


@pytest.mark.parametrize("payload", [{"currency": "DOLLARS"}, {"grand_total": "NaN"}, {"grand_total": "1e99"},
                                     {"invoice_date": "not-a-date"}, {"vendor_name": "x" * 300}])
def test_patch_validation_errors(client, payload):
    inv = mk(client)
    r = client.patch(f"/api/v1/invoices/{inv['id']}", json=payload)
    assert r.status_code == 422 and r.json()["error"]["code"] == "request_validation_failed"
    assert r.json()["error"]["details"][0]["field"]


def test_unknown_ids_404(client):
    for call in (client.get, client.delete):
        assert call("/api/v1/invoices/inv-missing").status_code == 404
    assert client.patch("/api/v1/invoices/inv-missing", json={}).json()["error"]["code"] == "invoice_not_found"
    assert client.post("/api/v1/invoices/inv-missing/validate").status_code == 404
    assert client.post("/api/v1/invoices/inv-missing/review", json={"action": "approved"}).status_code == 404


def test_archive_preserves_audit_and_related_records(client, fake_extractor, pdf_bytes):
    iid = upload(client, pdf_bytes).json()["results"][0]["invoice_id"]
    client.post(f"/api/v1/invoices/{iid}/review", json={"action": "marked_in_review", "comment": "x"})
    assert client.delete(f"/api/v1/invoices/{iid}").status_code == 204
    logs = client.get("/api/v1/audit-logs", params={"invoice_id": iid}).json()
    assert {l["action"] for l in logs["items"]} >= {"DOCUMENT_UPLOADED", "EXTRACTION_COMPLETED",
                                                    "INVOICE_MARKED_IN_REVIEW", "DOCUMENT_ARCHIVED"}
    assert len(client.get(f"/api/v1/invoices/{iid}/review-history").json()) == 1   # still readable
    assert client.get("/api/v1/invoices", params={"include_archived": True}).json()["total"] == 1


def test_list_filters_sort_and_pagination(client):
    mk(client, invoice_number="A1", vendor_name="Alpha", grand_total="110.00")
    mk(client, invoice_number="B1", vendor_name="Beta", grand_total="500.00", subtotal="450.00", tax_amount="50.00",
       line_items=[], invoice_date="2025-05-01", due_date=None)
    mk(client, invoice_number="C1", vendor_name="Gamma", grand_total="20.00", subtotal="20", tax_amount="0",
       line_items=[], vendor_tax_id=None)
    g = lambda **p: client.get("/api/v1/invoices", params=p).json()
    assert g(q="alp")["total"] == 1 and g(vendor="beta")["items"][0]["invoice_number"] == "B1"
    assert [i["invoice_number"] for i in g(sort="grand_total", order="asc")["items"]] == ["C1", "A1", "B1"]
    assert g(validation_status="warning")["total"] == 1
    assert g(date_from="2025-04-01", date_to="2025-12-31")["total"] == 1
    page = g(page=2, page_size=2)
    assert page["total"] == 3 and len(page["items"]) == 1
    assert client.get("/api/v1/invoices", params={"sort": "password"}).json()["error"]["code"] == "invalid_sort"
    assert client.get("/api/v1/invoices", params={"page_size": 9999}).status_code == 422


def test_duplicate_invoice_detected_and_partner_updated(client):
    a = mk(client)
    b = mk(client, grand_total="110.00")           # same vendor + number
    assert b["validation_status"] == "critical" and b["duplicate_of_id"] == a["id"]
    a2 = client.get(f"/api/v1/invoices/{a['id']}").json()
    assert a2["validation_status"] == "critical"   # earlier invoice re-validated via cascade
    client.delete(f"/api/v1/invoices/{b['id']}")
    client.post(f"/api/v1/invoices/{a['id']}/validate")
    assert client.get(f"/api/v1/invoices/{a['id']}").json()["validation_status"] == "valid"


def test_validate_endpoint_tolerance_override_and_unextracted_rejected(client, unconfigured_client, pdf_bytes):
    inv = mk(client, grand_total="110.05")
    assert inv["validation_status"] == "warning"
    r = client.post(f"/api/v1/invoices/{inv['id']}/validate", json={"tolerance": "0.10"}).json()
    assert r["validation_status"] == "valid"
    res = upload(unconfigured_client, pdf_bytes).json()["results"][0]
    r = unconfigured_client.post(f"/api/v1/invoices/{res['invoice_id']}/validate")
    assert r.status_code == 409 and r.json()["error"]["code"] == "invoice_not_validatable"


def test_reports_and_issue_listing(client):
    mk(client)
    mk(client, invoice_number="B", grand_total="999.00")
    s = client.get("/api/v1/reports/summary").json()
    assert s["total_invoices"] == 2 and s["totals_by_currency"]["USD"] == "1109.0000" and s["needs_attention"] == 1
    v = client.get("/api/v1/reports/validation").json()
    assert v["passed"] == 1 and v["critical_invoices"] == 1 and v["issues_by_rule"]["MATH_GRAND_TOTAL_MISMATCH"] == 1
    iss = client.get("/api/v1/validation/issues", params={"severity": "critical"}).json()
    assert iss["total"] == 1 and iss["items"][0]["invoice_number"] == "B"
    assert client.get("/api/v1/validation/issues", params={"severity": "bogus"}).status_code == 422


def test_data_persists_across_database_sessions(client, settings):
    inv = mk(client)
    from app.db import session as dbsession
    from app.db.models import Invoice
    from decimal import Decimal
    dbsession.get_engine().dispose()
    fresh = dbsession.make_engine(settings)           # brand-new engine/connection
    from sqlalchemy.orm import Session
    with Session(fresh) as s:
        row = s.get(Invoice, inv["id"])
        assert row.grand_total == Decimal("110") and row.line_items[0].quantity == Decimal("2")
    fresh.dispose()


def test_money_is_exact_decimal(client):
    inv = mk(client, subtotal="0.10", tax_amount="0.20", grand_total="0.30", line_items=[])
    assert inv["grand_total"] == "0.3000" and inv["validation_status"] == "valid"   # 0.1+0.2 == 0.3 exactly
