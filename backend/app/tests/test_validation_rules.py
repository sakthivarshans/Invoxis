from datetime import date
from decimal import Decimal as D
from types import SimpleNamespace as NS

from app.services.invoice_validation import ValidationConfig, validate_invoice

TODAY = date(2025, 6, 1)


def line(q="2", p="50.00", t="100.00", **kw):
    d = dict(quantity=D(q), unit_price=D(p), line_total=D(t), discount=None, discount_percent=None, tax_rate=None)
    d.update(kw)
    return NS(**d)


def inv(**kw):
    base = dict(id="a", invoice_number="N1", vendor_name="V", vendor_tax_id="T", currency="USD",
                invoice_date=date(2025, 3, 1), due_date=date(2025, 3, 31), subtotal=D("100"), tax_amount=D("10"),
                discount=D("0"), shipping_charges=D("0"), grand_total=D("110"), line_items=[line()],
                field_warnings=None, is_archived=False)
    base.update(kw)
    return NS(**base)


def run(i, others=(), **cfg):
    return validate_invoice(i, others, ValidationConfig(today=TODAY, **cfg))


def codes(out):
    return {x.rule_code for x in out.issues}


def test_clean_invoice_passes():
    out = run(inv())
    assert out.issues == [] and out.status == "valid"


def test_missing_required_fields():
    out = run(inv(invoice_number=None, vendor_name="  ", currency=None, grand_total=None, invoice_date=None))
    assert {"REQ_INVOICE_NUMBER", "REQ_VENDOR_NAME", "REQ_CURRENCY", "REQ_GRAND_TOTAL",
            "DATE_INVALID_INVOICE"} <= codes(out)
    assert out.status == "critical"


def test_zero_is_not_missing():
    out = run(inv(tax_amount=D("0"), grand_total=D("100")))
    assert "REQ_GRAND_TOTAL" not in codes(out) and out.status == "valid"


def test_due_before_invoice():
    assert "DATE_DUE_BEFORE_INVOICE" in codes(run(inv(due_date=date(2025, 2, 1))))


def test_future_invoice_date_warns():
    out = run(inv(invoice_date=date(2026, 1, 1), due_date=None))
    assert any(i.rule_code == "DATE_IMPLAUSIBLE" and i.severity == "warning" for i in out.issues)


def test_line_math_critical_and_expected_value():
    out = run(inv(line_items=[line(t="120.00")], subtotal=D("120"), grand_total=D("130")))
    i = next(x for x in out.issues if x.rule_code == "MATH_LINE_ITEM_TOTAL")
    assert i.severity == "critical" and "100.00" in i.expected_value


def test_rounding_within_tolerance_is_silent():
    out = run(inv(line_items=[line(q="3", p="3.333", t="10.00")], subtotal=D("10.00"), tax_amount=D("0"),
                  grand_total=D("10.01")))
    assert "MATH_LINE_ITEM_TOTAL" not in codes(out) and "MATH_GRAND_TOTAL_MISMATCH" not in codes(out)


def test_rounding_band_is_warning_not_critical():
    out = run(inv(grand_total=D("110.05")))          # diff 0.05: > 0.02, <= 0.10
    g = next(x for x in out.issues if x.rule_code == "MATH_GRAND_TOTAL_MISMATCH")
    assert g.severity == "warning"


def test_tolerance_is_configurable():
    assert "MATH_GRAND_TOTAL_MISMATCH" not in codes(run(inv(grand_total=D("110.05")), tolerance=D("0.05")))


def test_grand_total_mismatch_critical():
    g = next(x for x in run(inv(grand_total=D("150"))).issues if x.rule_code == "MATH_GRAND_TOTAL_MISMATCH")
    assert g.severity == "critical" and g.actual_value.endswith("150.00") and g.expected_value.endswith("110.00")


def test_missing_optional_components_do_not_downgrade_a_real_mismatch():
    out = run(inv(tax_amount=None, shipping_charges=None, discount=None, grand_total=D("150")))
    g = next(x for x in out.issues if x.rule_code == "MATH_GRAND_TOTAL_MISMATCH")
    assert g.severity == "critical" and g.category == "discrepancy"
    assert "tax" in g.explanation and "shipping" in g.explanation     # reviewer is told what was absent


def test_discount_and_shipping_reconcile():
    out = run(inv(subtotal=D("100"), tax_amount=D("8"), shipping_charges=D("5"), discount=D("10"),
                  grand_total=D("103")))
    assert "MATH_GRAND_TOTAL_MISMATCH" not in codes(out)


def test_subtotal_mismatch():
    out = run(inv(subtotal=D("90"), grand_total=D("100")))
    assert "MATH_SUBTOTAL_MISMATCH" in codes(out)


def test_line_percent_discount():
    out = run(inv(line_items=[line(t="90.00", discount_percent=D("10"))], subtotal=D("90"), tax_amount=D("0"),
                  grand_total=D("90")))
    assert out.issues == []


def test_negative_and_zero_quantity():
    out = run(inv(grand_total=D("-5"), line_items=[line(q="0", t="0")], subtotal=D("0"), tax_amount=D("0")))
    assert {"ANOMALY_NEGATIVE_TOTAL", "ANOMALY_QUANTITY_ZERO"} <= codes(out)


def test_implausible_amount():
    assert "ANOMALY_IMPLAUSIBLE_AMOUNT" in codes(run(inv(grand_total=D("5e9"), subtotal=D("5e9"), tax_amount=D(0),
                                                         line_items=[])))


def test_missing_tax_id_warning():
    out = run(inv(vendor_tax_id=None))
    assert out.status == "warning" and "TAX_VENDOR_ID_MISSING" in codes(out)


def test_tax_amount_vs_rates():
    out = run(inv(line_items=[line(tax_rate=D("20"))]))     # 20% of 100 = 20, tax says 10
    assert "TAX_AMOUNT_MISMATCH" in codes(out)


def test_duplicate_detection_case_insensitive_and_archive_ignored():
    other = inv(id="b", vendor_name=" v ", invoice_number="n1")
    assert "FRAUD_DUPLICATE_INVOICE" in codes(run(inv(), [other]))
    other.is_archived = True
    assert "FRAUD_DUPLICATE_INVOICE" not in codes(run(inv(), [other]))
    assert "FRAUD_DUPLICATE_INVOICE" not in codes(run(inv(), [inv(id="b")], detect_duplicates=False))


def test_same_vendor_date_amount_different_number():
    assert "FRAUD_DUPLICATE_AMOUNT_DATE" in codes(run(inv(), [inv(id="b", invoice_number="N2")]))


def test_extractor_warnings_become_needs_verification():
    out = run(inv(field_warnings={"grandTotal": {"reason": "ambiguous_format", "raw": "1,234"}}))
    i = next(x for x in out.issues if x.rule_code == "NEEDS_VERIFICATION_FIELD")
    assert i.category == "needs_verification" and i.actual_value == "1,234"


def test_validation_does_not_mutate_invoice():
    i = inv(grand_total=D("999"))
    before = (i.grand_total, i.subtotal, list(i.line_items))
    run(i)
    assert (i.grand_total, i.subtotal, list(i.line_items)) == before


def test_issue_keys_are_stable_and_distinct_per_line():
    a = run(inv(line_items=[line(t="1"), line(t="2")], subtotal=D("3")))
    b = run(inv(line_items=[line(t="1"), line(t="2")], subtotal=D("3")))
    ka = [x.issue_key for x in a.issues if x.rule_code == "MATH_LINE_ITEM_TOTAL"]
    assert len(ka) == 2 and len(set(ka)) == 2 and ka == [x.issue_key for x in b.issues if x.rule_code == "MATH_LINE_ITEM_TOTAL"]
