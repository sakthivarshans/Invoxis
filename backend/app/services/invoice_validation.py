"""Deterministic financial validation. Pure functions over Decimal; no database, no LLM.

Conventions (documented in README):
* Line discount is an AMOUNT (or a percent held separately). Header discount REDUCES the total:
      expected_total = subtotal + tax + shipping - discount
* Rounding: |diff| <= tolerance passes. tolerance < |diff| <= 5*tolerance is a *warning*
  ("possible rounding difference"); beyond that it is *critical*. Sum-of-lines checks allow each
  line to contribute up to one tolerance of rounding error.
* Validation never mutates invoice fields.
"""
from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from datetime import date, timedelta
from decimal import Decimal
from typing import Any, Iterable, Sequence

ZERO = Decimal("0")
ROUNDING_WARNING_BAND = Decimal("5")


@dataclass
class IssueDraft:
    rule_code: str
    rule_title: str
    field: str | None
    severity: str                  # critical | warning | info
    explanation: str
    recommended_action: str
    actual_value: str | None = None
    expected_value: str | None = None
    category: str = "discrepancy"  # discrepancy | needs_verification
    line_index: int | None = None

    @property
    def issue_key(self) -> str:
        raw = f"{self.rule_code}|{self.field or ''}|{self.line_index if self.line_index is not None else ''}"
        return "k-" + hashlib.sha1(raw.encode()).hexdigest()[:14]


@dataclass
class ValidationConfig:
    tolerance: Decimal = Decimal("0.02")
    max_plausible_amount: Decimal = Decimal("1000000000")
    detect_duplicates: bool = True
    today: date | None = None


@dataclass
class ValidationOutcome:
    issues: list[IssueDraft] = field(default_factory=list)

    @property
    def status(self) -> str:
        """valid | warning | critical. (needs_verification issues are warnings.)"""
        sev = {i.severity for i in self.issues}
        if "critical" in sev:
            return "critical"
        if "warning" in sev:
            return "warning"
        return "valid"


def _blank(v: Any) -> bool:
    return v is None or (isinstance(v, str) and v.strip() == "")


def _fmt(v: Decimal | None, cur: str | None = None) -> str:
    if v is None:
        return "—"
    s = f"{v:,.2f}"
    return f"{cur} {s}" if cur else s


def _norm(s: str | None) -> str:
    return " ".join((s or "").lower().split())


def _band(diff: Decimal, tol: Decimal) -> str | None:
    """None if within tolerance, else 'warning' (rounding band) or 'critical'."""
    d = abs(diff)
    if d <= tol:
        return None
    return "warning" if d <= tol * ROUNDING_WARNING_BAND else "critical"


def expected_line_total(li: Any) -> Decimal | None:
    if li.quantity is None or li.unit_price is None:
        return None
    base = li.quantity * li.unit_price
    if li.discount is not None:
        base -= li.discount
    elif getattr(li, "discount_percent", None) is not None:
        base -= base * li.discount_percent / Decimal(100)
    return base


def validate_invoice(inv: Any, others: Iterable[Any] = (), cfg: ValidationConfig | None = None
                     ) -> ValidationOutcome:
    cfg = cfg or ValidationConfig()
    tol = cfg.tolerance
    cur = inv.currency
    out: list[IssueDraft] = []
    add = out.append
    lines: Sequence[Any] = list(inv.line_items or [])

    # ---- required fields -------------------------------------------------------------------
    if _blank(inv.invoice_number):
        add(IssueDraft("REQ_INVOICE_NUMBER", "Missing Invoice Number", "invoiceNumber", "critical",
                       "Invoice number is mandatory for matching and de-duplication.",
                       "Locate the invoice identifier in the source document and enter it.",
                       actual_value="(missing)"))
    if _blank(inv.vendor_name):
        add(IssueDraft("REQ_VENDOR_NAME", "Missing Vendor Identification", "vendorName", "critical",
                       "Vendor name was not found.",
                       "Enter the legal entity name shown on the invoice.", actual_value="(missing)"))
    if _blank(cur):
        add(IssueDraft("REQ_CURRENCY", "Missing Currency Specification", "currency", "critical",
                       "No ISO currency code is stated on the document. The currency is not inferred "
                       "from symbols.", "Confirm the transaction currency from the source and enter it.",
                       actual_value="(missing)", expected_value="ISO 4217 code, e.g. USD"))
    if inv.grand_total is None:
        add(IssueDraft("REQ_GRAND_TOTAL", "Missing Grand Total", "grandTotal", "critical",
                       "No grand total could be extracted.",
                       "Read the payable total from the source document and enter it.",
                       actual_value="(missing)"))

    # ---- dates -----------------------------------------------------------------------------
    today = cfg.today or date.today()
    if inv.invoice_date is None:
        add(IssueDraft("DATE_INVALID_INVOICE", "Invalid Invoice Date", "invoiceDate", "critical",
                       "Invoice date is missing or could not be read as a valid date.",
                       "Verify the date on the invoice header and enter it.", actual_value="(missing)"))
    else:
        if inv.invoice_date > today + timedelta(days=1):
            add(IssueDraft("DATE_IMPLAUSIBLE", "Invoice Date In The Future", "invoiceDate", "warning",
                           f"Invoice date {inv.invoice_date} is later than today ({today}).",
                           "Check for a day/month transposition or a typo.",
                           actual_value=str(inv.invoice_date), expected_value=f"<= {today}"))
        elif inv.invoice_date.year < 2000:
            add(IssueDraft("DATE_IMPLAUSIBLE", "Implausibly Old Invoice Date", "invoiceDate", "warning",
                           f"Invoice date {inv.invoice_date} is before the year 2000.",
                           "Verify the year on the source document.", actual_value=str(inv.invoice_date)))
    if inv.invoice_date and inv.due_date and inv.due_date < inv.invoice_date:
        add(IssueDraft("DATE_DUE_BEFORE_INVOICE", "Payment Due Date Precedes Invoice Date", "dueDate",
                       "critical",
                       f"Due date {inv.due_date} is earlier than invoice date {inv.invoice_date}.",
                       "Check the payment terms and correct the due date.",
                       actual_value=str(inv.due_date), expected_value=f">= {inv.invoice_date}"))

    # ---- line items ------------------------------------------------------------------------
    for i, li in enumerate(lines):
        n = i + 1
        fld = f"lineItems[{i}]"
        exp = expected_line_total(li)
        if exp is not None and li.line_total is not None:
            sev = _band(exp - li.line_total, tol)
            if sev:
                add(IssueDraft(
                    "MATH_LINE_ITEM_TOTAL", f"Line Item {n} Calculation Discrepancy", f"{fld}.lineTotal",
                    sev,
                    f"Line total {_fmt(li.line_total)} differs from quantity {li.quantity.normalize():f} × "
                    f"unit price {_fmt(li.unit_price)} (less discount) = {_fmt(exp)}"
                    + (" — within the rounding-review band." if sev == "warning" else "."),
                    "Correct the line total, quantity or unit price after checking the source.",
                    actual_value=_fmt(li.line_total, cur), expected_value=_fmt(exp, cur), line_index=i))
        elif li.line_total is not None and (li.quantity is None or li.unit_price is None):
            add(IssueDraft("NEEDS_VERIFICATION_LINE", f"Line Item {n} Cannot Be Recalculated",
                           f"{fld}.lineTotal", "info",
                           "Quantity or unit price is missing, so the line total cannot be verified.",
                           "Verify this line against the source document.",
                           category="needs_verification", line_index=i))
        if li.quantity is not None and li.quantity <= 0:
            add(IssueDraft("ANOMALY_QUANTITY_ZERO", f"Line Item {n} Non-Positive Quantity",
                           f"{fld}.quantity", "warning",
                           "Quantity is zero or negative (valid only for credit notes).",
                           "Verify the quantity; confirm whether this is a credit memo.",
                           actual_value=str(li.quantity.normalize()), expected_value="> 0", line_index=i))
        for attr, label in (("unit_price", "unit price"), ("line_total", "line total")):
            v = getattr(li, attr)
            if v is not None and v < 0:
                add(IssueDraft("ANOMALY_NEGATIVE_AMOUNT", f"Line Item {n} Negative {label.title()}",
                               f"{fld}.{attr}", "warning", f"Negative {label} ({_fmt(v)}).",
                               "Confirm this is an intended credit or correction line.",
                               actual_value=_fmt(v, cur), line_index=i))

    # ---- subtotal vs line sum --------------------------------------------------------------
    priced = [li.line_total for li in lines if li.line_total is not None]
    if lines and inv.subtotal is not None and priced and len(priced) == len(lines):
        total = sum(priced, ZERO)
        sev = _band(total - inv.subtotal, tol * max(1, len(lines)))
        if sev:
            add(IssueDraft("MATH_SUBTOTAL_MISMATCH", "Line Items Sum vs Subtotal Mismatch", "subtotal",
                           sev,
                           f"Line items sum to {_fmt(total)} but the subtotal is {_fmt(inv.subtotal)} "
                           f"(variance {_fmt(inv.subtotal - total)}). Lines may be missing or the subtotal "
                           "may be misread.",
                           "Compare against the source for missing line items; no lines are invented.",
                           actual_value=_fmt(inv.subtotal, cur), expected_value=_fmt(total, cur)))
    elif lines and len(priced) != len(lines):
        add(IssueDraft("NEEDS_VERIFICATION_LINE", "Some Line Totals Missing", "lineItems", "info",
                       "One or more lines have no line total, so the line sum cannot be reconciled.",
                       "Fill in or verify the missing line totals.", category="needs_verification"))

    # ---- grand total reconciliation --------------------------------------------------------
    if inv.subtotal is not None and inv.grand_total is not None:
        parts = {"tax": inv.tax_amount, "shipping": inv.shipping_charges, "discount": inv.discount}
        expected = inv.subtotal + (parts["tax"] or ZERO) + (parts["shipping"] or ZERO) - (parts["discount"] or ZERO)
        sev = _band(expected - inv.grand_total, tol)
        if sev:
            # Severity follows the size of the gap only. A missing optional component (no shipping or
            # discount line) is normal on most invoices, so it must NOT downgrade a real mismatch; it is
            # noted in the explanation to help the reviewer instead.
            absent = [k for k, v in parts.items() if v is None]
            note = f" Not present on the invoice (treated as 0): {', '.join(absent)}." if absent else ""
            add(IssueDraft(
                "MATH_GRAND_TOTAL_MISMATCH", "Grand Total Calculation Discrepancy", "grandTotal", sev,
                f"Grand total {_fmt(inv.grand_total)} ≠ subtotal {_fmt(inv.subtotal)} + tax "
                f"{_fmt(parts['tax'])} + shipping {_fmt(parts['shipping'])} − discount "
                f"{_fmt(parts['discount'])} = {_fmt(expected)}.{note}",
                "Recompute from the source; check for fees or discounts not captured.",
                actual_value=_fmt(inv.grand_total, cur), expected_value=_fmt(expected, cur)))
    elif inv.grand_total is not None and not lines:
        add(IssueDraft("NEEDS_VERIFICATION_TOTALS", "Totals Cannot Be Reconciled", "subtotal", "info",
                       "No subtotal or line items were extracted, so the grand total cannot be reconciled.",
                       "Verify totals manually.", category="needs_verification"))

    # ---- tax -------------------------------------------------------------------------------
    if _blank(inv.vendor_tax_id):
        add(IssueDraft("TAX_VENDOR_ID_MISSING", "Missing Vendor Tax / VAT ID", "vendorTaxId", "warning",
                       "No vendor tax identifier was found on the invoice.",
                       "Verify the vendor's tax registration where required.", actual_value="(missing)"))
    if (inv.tax_amount is not None and lines
            and all(li.tax_rate is not None and li.line_total is not None for li in lines)):
        exp_tax = sum((li.line_total * li.tax_rate / Decimal(100) for li in lines), ZERO)
        sev = _band(exp_tax - inv.tax_amount, tol * max(1, len(lines)))
        if sev:
            add(IssueDraft("TAX_AMOUNT_MISMATCH", "Tax Amount Inconsistent With Line Tax Rates",
                           "taxAmount", "warning",
                           f"Tax {_fmt(inv.tax_amount)} differs from Σ(line total × rate) = {_fmt(exp_tax)}. "
                           "This assumes line totals are tax-exclusive.",
                           "Check whether prices include tax or whether tax is rounded per invoice.",
                           actual_value=_fmt(inv.tax_amount, cur), expected_value=_fmt(exp_tax, cur)))

    # ---- sign / plausibility of header amounts ---------------------------------------------
    if inv.grand_total is not None and inv.grand_total < 0:
        add(IssueDraft("ANOMALY_NEGATIVE_TOTAL", "Negative Grand Total on Standard Invoice", "grandTotal",
                       "warning", "Total payable is negative; this should be a credit note.",
                       "Categorise as a credit memo or correct the sign.",
                       actual_value=_fmt(inv.grand_total, cur), expected_value=">= 0.00"))
    for attr, label in (("subtotal", "subtotal"), ("tax_amount", "tax amount"),
                        ("shipping_charges", "shipping"), ("discount", "discount")):
        v = getattr(inv, attr)
        if v is not None and v < 0:
            add(IssueDraft("ANOMALY_NEGATIVE_AMOUNT", f"Negative {label.title()}", attr_to_camel(attr),
                           "warning", f"The {label} is negative ({_fmt(v)}).",
                           "Confirm the sign is intended.", actual_value=_fmt(v, cur)))
    big = cfg.max_plausible_amount
    for attr in ("subtotal", "tax_amount", "shipping_charges", "discount", "grand_total"):
        v = getattr(inv, attr)
        if v is not None and abs(v) > big:
            add(IssueDraft("ANOMALY_IMPLAUSIBLE_AMOUNT", "Implausibly Large Amount", attr_to_camel(attr),
                           "warning", f"{attr_to_camel(attr)} exceeds the configured plausibility limit.",
                           "Check for misplaced decimal separators.", actual_value=_fmt(v, cur),
                           expected_value=f"<= {_fmt(big)}"))

    # ---- duplicates ------------------------------------------------------------------------
    if cfg.detect_duplicates and not _blank(inv.vendor_name):
        peers = [o for o in others if o.id != inv.id and not getattr(o, "is_archived", False)]
        if not _blank(inv.invoice_number):
            dup = next((o for o in peers if _norm(o.vendor_name) == _norm(inv.vendor_name)
                        and _norm(o.invoice_number) == _norm(inv.invoice_number)), None)
            if dup:
                add(IssueDraft("FRAUD_DUPLICATE_INVOICE", "Potential Duplicate Invoice Detected",
                               "invoiceNumber", "critical",
                               f'Invoice "{inv.invoice_number}" from "{inv.vendor_name}" already exists '
                               f"in the system ({dup.id}).",
                               "Verify whether this is a re-sent invoice before paying.",
                               actual_value=inv.invoice_number,
                               expected_value=f"Unique per vendor (conflicts with {dup.id})"))
        if inv.grand_total is not None and inv.invoice_date is not None:
            dup2 = next((o for o in peers if _norm(o.vendor_name) == _norm(inv.vendor_name)
                         and o.grand_total == inv.grand_total and o.invoice_date == inv.invoice_date
                         and _norm(o.invoice_number) != _norm(inv.invoice_number)), None)
            if dup2:
                add(IssueDraft("FRAUD_DUPLICATE_AMOUNT_DATE", "Same Vendor, Date and Amount as Another Invoice",
                               "grandTotal", "warning",
                               f"Matches {dup2.id} on vendor, invoice date and total but has a different "
                               "invoice number.", "Check for a re-issued invoice under a new number.",
                               actual_value=_fmt(inv.grand_total, cur)))

    # ---- extractor-reported uncertainty (deterministic: derived from stored warnings) ------
    for fname, w in sorted((inv.field_warnings or {}).items()):
        add(IssueDraft("NEEDS_VERIFICATION_FIELD", f"Needs Verification: {fname}", fname, "warning",
                       f"Extractor flagged this field as {w.get('reason', 'uncertain')}"
                       + (f" ({w['detail']})" if w.get("detail") else "") + ".",
                       "Compare the value with the source document and correct it if needed.",
                       actual_value=w.get("raw"), category="needs_verification"))

    return ValidationOutcome(out)


def attr_to_camel(attr: str) -> str:
    head, *rest = attr.split("_")
    return head + "".join(p.title() for p in rest)
