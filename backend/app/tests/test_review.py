import pytest

from app.tests.test_api_invoices import mk


def review(client, iid, action, comment=None):
    return client.post(f"/api/v1/invoices/{iid}/review", json={"action": action, "comment": comment})


def test_happy_path_and_history_ordering(client):
    iid = mk(client)["id"]
    assert review(client, iid, "marked_in_review", "looking").json()["review_status"] == "in_review"
    r = review(client, iid, "approved", "ok")
    assert r.status_code == 200 and r.json()["review_status"] == "approved"
    hist = client.get(f"/api/v1/invoices/{iid}/review-history").json()
    assert [(h["previous_status"], h["new_status"]) for h in hist] == [("in_review", "approved"), ("pending", "in_review")]
    assert hist[0]["actor"] and "unauthenticated" in hist[0]["actor"]     # honest actor identity


@pytest.mark.parametrize("path,bad", [
    (["approved"], "approved"), (["rejected"], "approved"), (["marked_in_review"], "marked_in_review"),
    (["returned_for_correction"], "approved")])
def test_invalid_transitions_rejected_without_side_effects(client, path, bad):
    iid = mk(client)["id"]
    for a in path:
        assert review(client, iid, a, "because").status_code == 200
    before = client.get(f"/api/v1/invoices/{iid}").json()
    r = review(client, iid, bad, "again")
    assert r.status_code == 409 and r.json()["error"]["code"] == "invalid_review_transition"
    after = client.get(f"/api/v1/invoices/{iid}").json()
    assert after["review_status"] == before["review_status"] and len(after["review_history"]) == len(before["review_history"])


def test_reject_and_return_require_comment(client):
    iid = mk(client)["id"]
    for a in ("rejected", "returned_for_correction"):
        r = review(client, iid, a, "  ")
        assert r.status_code == 422 and r.json()["error"]["code"] == "comment_required"
    assert client.get(f"/api/v1/invoices/{iid}").json()["review_status"] == "pending"


def test_note_added_keeps_status(client):
    iid = mk(client)["id"]
    r = review(client, iid, "note_added", "FYI").json()
    assert r["review_status"] == "pending" and r["review_history"][0]["action"] == "note_added"
    assert review(client, iid, "note_added", "").status_code == 422


def test_invalid_action_value_422(client):
    iid = mk(client)["id"]
    assert review(client, iid, "pay_now").status_code == 422


def test_reopen_after_approval_allows_edit_again(client):
    iid = mk(client)["id"]
    review(client, iid, "approved", "ok")
    r = client.patch(f"/api/v1/invoices/{iid}", json={"vendor_name": "X"})
    assert r.status_code == 409 and r.json()["error"]["code"] == "invoice_locked"
    review(client, iid, "marked_in_review", "reopen")
    assert client.patch(f"/api/v1/invoices/{iid}", json={"vendor_name": "X"}).status_code == 200


def test_cannot_review_unextracted_invoice(unconfigured_client, pdf_bytes):
    from app.tests.conftest import upload
    iid = upload(unconfigured_client, pdf_bytes).json()["results"][0]["invoice_id"]
    r = unconfigured_client.post(f"/api/v1/invoices/{iid}/review", json={"action": "approved"})
    assert r.status_code == 409 and r.json()["error"]["code"] == "invoice_not_reviewable"


def test_review_queue_contents(client):
    ok = mk(client)["id"]
    bad = mk(client, invoice_number="B", grand_total="999.00")["id"]
    q = lambda: {i["id"] for i in client.get("/api/v1/review-queue").json()["items"]}
    assert q() == {bad}
    review(client, ok, "marked_in_review", "x")
    assert q() == {bad, ok}
    review(client, bad, "rejected", "wrong")
    review(client, ok, "approved", "fine")
    assert q() == set()


def test_review_actions_are_audited(client):
    iid = mk(client)["id"]
    review(client, iid, "returned_for_correction", "fix total")
    ev = client.get("/api/v1/audit-logs", params={"invoice_id": iid, "category": "review"}).json()["items"][0]
    assert ev["action"] == "INVOICE_RETURNED_FOR_CORRECTION" and ev["details"] == {
        "previous_status": "pending", "new_status": "returned_for_correction", "comment": "fix total"}
