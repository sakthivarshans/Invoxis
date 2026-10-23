import { Invoice, LineItem, ValidationIssue } from '../types/invoice';

/**
 * Standard rounding to 2 decimal places
 */
export function roundCurrency(num: number): number {
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

/**
 * Calculates a single line item total:
 * Quantity * UnitPrice - Discount (or if tax is inclusive/exclusive, compute standard base line total)
 */
export function calculateLineTotal(item: LineItem): number {
  const base = item.quantity * item.unitPrice;
  const discountAmount = item.discount > 0 ? (item.discount > 1 ? item.discount : base * item.discount) : 0;
  return roundCurrency(Math.max(0, base - discountAmount));
}

/**
 * Calculates line items subtotal
 */
export function calculateSubtotal(lineItems: LineItem[]): number {
  const total = lineItems.reduce((acc, item) => acc + (item.lineTotal || calculateLineTotal(item)), 0);
  return roundCurrency(total);
}

/**
 * Calculates expected grand total from components
 */
export function calculateExpectedGrandTotal(
  subtotal: number,
  taxAmount: number,
  shippingCharges: number,
  discount: number
): number {
  return roundCurrency(subtotal + taxAmount + shippingCharges - discount);
}

/**
 * Evaluates full set of deterministic validation rules against an invoice
 */
export function runInvoiceValidation(
  invoice: Invoice,
  tolerance: number = 0.02,
  allInvoices: Invoice[] = []
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // 1. Required field: Invoice Number
  if (!invoice.invoiceNumber || invoice.invoiceNumber.trim() === '') {
    issues.push({
      id: `${invoice.id}-missing-inv-no`,
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber || 'Unknown',
      vendorName: invoice.vendorName || 'Unknown Vendor',
      ruleId: 'REQ_INVOICE_NUMBER',
      ruleTitle: 'Missing Invoice Number',
      field: 'invoiceNumber',
      extractedValue: 'Empty',
      severity: 'critical',
      explanation: 'Invoice number is mandatory for accounts payable matching and deduplication.',
      suggestedAction: 'Locate invoice identifier in original document and enter manually.',
    });
  }

  // 2. Required field: Vendor Name
  if (!invoice.vendorName || invoice.vendorName.trim() === '') {
    issues.push({
      id: `${invoice.id}-missing-vendor`,
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber || 'Unknown',
      vendorName: 'Unknown',
      ruleId: 'REQ_VENDOR_NAME',
      ruleTitle: 'Missing Vendor Identification',
      field: 'vendorName',
      extractedValue: 'Empty',
      severity: 'critical',
      explanation: 'Vendor name could not be extracted or matched against vendor master directory.',
      suggestedAction: 'Select or input legitimate legal entity name.',
    });
  }

  // 3. Required field: Currency
  if (!invoice.currency || invoice.currency.trim() === '') {
    issues.push({
      id: `${invoice.id}-missing-currency`,
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      vendorName: invoice.vendorName,
      ruleId: 'REQ_CURRENCY',
      ruleTitle: 'Missing Currency Specification',
      field: 'currency',
      extractedValue: 'None',
      expectedValue: 'USD, EUR, GBP, etc.',
      severity: 'critical',
      explanation: 'No ISO currency code identified. Financial books require explicit transaction currency.',
      suggestedAction: 'Specify transaction ISO currency code in extraction studio.',
    });
  }

  // 4. Date validation: Invoice Date
  if (!invoice.invoiceDate || isNaN(new Date(invoice.invoiceDate).getTime())) {
    issues.push({
      id: `${invoice.id}-invalid-inv-date`,
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      vendorName: invoice.vendorName,
      ruleId: 'DATE_INVALID_INVOICE',
      ruleTitle: 'Invalid Invoice Date',
      field: 'invoiceDate',
      extractedValue: invoice.invoiceDate || 'Empty',
      severity: 'critical',
      explanation: 'Invoice date is missing or has an unparseable timestamp format.',
      suggestedAction: 'Verify date on invoice header and re-enter.',
    });
  }

  // 5. Date logic: Due Date earlier than Invoice Date
  if (invoice.invoiceDate && invoice.dueDate) {
    const invDate = new Date(invoice.invoiceDate).getTime();
    const dueDate = new Date(invoice.dueDate).getTime();
    if (!isNaN(invDate) && !isNaN(dueDate) && dueDate < invDate) {
      issues.push({
        id: `${invoice.id}-due-before-inv`,
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        vendorName: invoice.vendorName,
        ruleId: 'DATE_DUE_BEFORE_INVOICE',
        ruleTitle: 'Payment Due Date Precedes Invoice Date',
        field: 'dueDate',
        extractedValue: invoice.dueDate,
        expectedValue: `>= ${invoice.invoiceDate}`,
        severity: 'critical',
        explanation: `Payment due date (${invoice.dueDate}) cannot occur prior to invoice issuance date (${invoice.invoiceDate}).`,
        suggestedAction: 'Check payment terms and correct the due date.',
      });
    }
  }

  // 6. Line item multiplication discrepancy: Quantity * UnitPrice vs LineTotal
  invoice.lineItems.forEach((item, index) => {
    const computed = calculateLineTotal(item);
    const diff = Math.abs(computed - item.lineTotal);
    if (diff > tolerance) {
      issues.push({
        id: `${invoice.id}-line-${index}-math`,
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        vendorName: invoice.vendorName,
        ruleId: 'MATH_LINE_ITEM_TOTAL',
        ruleTitle: `Line Item ${index + 1} Calculation Discrepancy`,
        field: `lineItems[${index}].lineTotal`,
        extractedValue: `${invoice.currency} ${item.lineTotal.toFixed(2)}`,
        expectedValue: `${invoice.currency} ${computed.toFixed(2)}`,
        severity: 'critical',
        explanation: `Line item "${item.description}" total (${item.lineTotal.toFixed(2)}) deviates from Qty (${item.quantity}) × Unit Price (${item.unitPrice.toFixed(2)}) - Discount (${item.discount.toFixed(2)}) = ${computed.toFixed(2)}.`,
        suggestedAction: 'Update line total or adjust quantity and unit price.',
      });
    }

    if (item.quantity <= 0) {
      issues.push({
        id: `${invoice.id}-line-${index}-qty-nonpositive`,
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        vendorName: invoice.vendorName,
        ruleId: 'ANOMALY_QUANTITY_ZERO',
        ruleTitle: `Line Item ${index + 1} Non-Positive Quantity`,
        field: `lineItems[${index}].quantity`,
        extractedValue: `${item.quantity}`,
        expectedValue: '> 0',
        severity: 'warning',
        explanation: 'Item quantity is zero or negative without credit memo designation.',
        suggestedAction: 'Verify original invoice quantity specification.',
      });
    }
  });

  // 7. Sum of line items versus Subtotal
  if (invoice.lineItems.length > 0) {
    const computedSubtotal = calculateSubtotal(invoice.lineItems);
    const diff = Math.abs(computedSubtotal - invoice.subtotal);
    if (diff > tolerance) {
      issues.push({
        id: `${invoice.id}-subtotal-mismatch`,
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        vendorName: invoice.vendorName,
        ruleId: 'MATH_SUBTOTAL_MISMATCH',
        ruleTitle: 'Line Items Sum vs Subtotal Mismatch',
        field: 'subtotal',
        extractedValue: `${invoice.currency} ${invoice.subtotal.toFixed(2)}`,
        expectedValue: `${invoice.currency} ${computedSubtotal.toFixed(2)}`,
        severity: 'critical',
        explanation: `Sum of line item totals is ${computedSubtotal.toFixed(2)}, which does not match header subtotal ${invoice.subtotal.toFixed(2)} (variance: ${(invoice.subtotal - computedSubtotal).toFixed(2)}).`,
        suggestedAction: 'Recalculate subtotal or review missing line items.',
      });
    }
  }

  // 8. Subtotal + Tax + Shipping - Discount vs Grand Total
  const expectedGrandTotal = calculateExpectedGrandTotal(
    invoice.subtotal,
    invoice.taxAmount,
    invoice.shippingCharges,
    invoice.discount
  );
  const grandTotalDiff = Math.abs(expectedGrandTotal - invoice.grandTotal);
  if (grandTotalDiff > tolerance) {
    issues.push({
      id: `${invoice.id}-grand-total-mismatch`,
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      vendorName: invoice.vendorName,
      ruleId: 'MATH_GRAND_TOTAL_MISMATCH',
      ruleTitle: 'Grand Total Calculation Discrepancy',
      field: 'grandTotal',
      extractedValue: `${invoice.currency} ${invoice.grandTotal.toFixed(2)}`,
      expectedValue: `${invoice.currency} ${expectedGrandTotal.toFixed(2)}`,
      severity: 'critical',
      explanation: `Grand total ${invoice.grandTotal.toFixed(2)} does not match Subtotal (${invoice.subtotal.toFixed(2)}) + Tax (${invoice.taxAmount.toFixed(2)}) + Shipping (${invoice.shippingCharges.toFixed(2)}) - Discount (${invoice.discount.toFixed(2)}) = ${expectedGrandTotal.toFixed(2)}.`,
      suggestedAction: 'Recompute grand total or investigate hidden fees/discounts.',
    });
  }

  // 9. Vendor Tax ID / Registration Warning
  if (!invoice.vendorTaxId || invoice.vendorTaxId.trim() === '') {
    issues.push({
      id: `${invoice.id}-missing-tax-id`,
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      vendorName: invoice.vendorName,
      ruleId: 'TAX_VENDOR_ID_MISSING',
      ruleTitle: 'Missing Vendor Tax / VAT ID',
      field: 'vendorTaxId',
      extractedValue: 'Unspecified',
      severity: 'warning',
      explanation: 'Tax identification number (EIN/VAT/GST) was not found on the invoice.',
      suggestedAction: 'Verify vendor tax documentation for 1099/VAT compliance.',
    });
  }

  // 10. Potential duplicate detection
  if (allInvoices.length > 0) {
    const duplicate = allInvoices.find(
      (other) =>
        other.id !== invoice.id &&
        other.vendorName.toLowerCase().trim() === invoice.vendorName.toLowerCase().trim() &&
        other.invoiceNumber.toLowerCase().trim() === invoice.invoiceNumber.toLowerCase().trim()
    );
    if (duplicate || invoice.isDuplicateCandidate) {
      issues.push({
        id: `${invoice.id}-potential-duplicate`,
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        vendorName: invoice.vendorName,
        ruleId: 'FRAUD_DUPLICATE_INVOICE',
        ruleTitle: 'Potential Duplicate Invoice Detected',
        field: 'invoiceNumber',
        extractedValue: invoice.invoiceNumber,
        expectedValue: `Unique across ${invoice.vendorName}`,
        severity: 'critical',
        explanation: `Another invoice with invoice number "${invoice.invoiceNumber}" from vendor "${invoice.vendorName}" already exists in the system (${duplicate?.id || invoice.duplicateOfId || 'previous batch'}).`,
        suggestedAction: 'Verify whether this is a re-sent invoice or duplicate payment risk.',
      });
    }
  }

  // 11. Negative amounts warning
  if (invoice.grandTotal < 0) {
    issues.push({
      id: `${invoice.id}-negative-total`,
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      vendorName: invoice.vendorName,
      ruleId: 'ANOMALY_NEGATIVE_TOTAL',
      ruleTitle: 'Negative Grand Total on Standard Invoice',
      field: 'grandTotal',
      extractedValue: `${invoice.currency} ${invoice.grandTotal.toFixed(2)}`,
      expectedValue: '>= 0.00',
      severity: 'warning',
      explanation: 'Total invoice payable is negative. Ensure this is categorized as a credit note if applicable.',
      suggestedAction: 'Categorize as credit memo or rectify negative balance.',
    });
  }

  return issues;
}
