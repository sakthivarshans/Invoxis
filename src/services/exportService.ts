import * as XLSX from 'xlsx';
import { Invoice, ValidationIssue } from '../types/invoice';
import { formatCurrency } from '../utils/currency';
import { formatDate } from '../utils/dates';

export class ExportService {
  /**
   * Helper to trigger browser download of a blob
   */
  private static triggerDownload(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  /**
   * Converts array of objects to CSV string safely escaping quotes and commas
   */
  private static toCSV(headers: string[], rows: (string | number)[][]): string {
    const escape = (val: string | number) => {
      const s = String(val ?? '');
      if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    };

    const headerLine = headers.map(escape).join(',');
    const rowLines = rows.map((row) => row.map(escape).join(',')).join('\n');
    return `${headerLine}\n${rowLines}`;
  }

  /**
   * Export invoice register as CSV
   */
  static exportInvoicesCSV(invoices: Invoice[], filename = 'invoxis_invoices.csv'): void {
    const headers = [
      'Invoice Number',
      'Vendor Name',
      'Invoice Date',
      'Due Date',
      'Currency',
      'Subtotal',
      'Tax Amount',
      'Discount',
      'Shipping Charges',
      'Grand Total',
      'Processing Status',
      'Validation Status',
      'Review Status',
      'Assigned Reviewer',
      'Payment Terms',
      'Payment Reference',
      'Filename',
    ];

    const rows = invoices.map((inv) => [
      inv.invoiceNumber,
      inv.vendorName,
      inv.invoiceDate,
      inv.dueDate,
      inv.currency,
      inv.subtotal,
      inv.taxAmount,
      inv.discount,
      inv.shippingCharges,
      inv.grandTotal,
      inv.processingStatus,
      inv.validationStatus,
      inv.reviewStatus,
      inv.assignedReviewer || 'Unassigned',
      inv.paymentTerms,
      inv.paymentReference,
      inv.fileName,
    ]);

    const csv = this.toCSV(headers, rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    this.triggerDownload(blob, filename);
  }

  /**
   * Export line items across invoices as CSV
   */
  static exportLineItemsCSV(invoices: Invoice[], filename = 'invoxis_line_items.csv'): void {
    const headers = [
      'Invoice Number',
      'Vendor Name',
      'Item Description',
      'Quantity',
      'Unit Price',
      'Discount',
      'Tax Rate (%)',
      'Line Total',
      'Currency',
    ];

    const rows: (string | number)[][] = [];
    invoices.forEach((inv) => {
      inv.lineItems.forEach((item) => {
        rows.push([
          inv.invoiceNumber,
          inv.vendorName,
          item.description,
          item.quantity,
          item.unitPrice,
          item.discount,
          item.taxRate,
          item.lineTotal,
          inv.currency,
        ]);
      });
    });

    const csv = this.toCSV(headers, rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    this.triggerDownload(blob, filename);
  }

  /**
   * Export validation discrepancies as CSV
   */
  static exportValidationIssuesCSV(issues: ValidationIssue[], filename = 'invoxis_validation_issues.csv'): void {
    const headers = [
      'Invoice Number',
      'Vendor Name',
      'Rule ID',
      'Rule Title',
      'Severity',
      'Field',
      'Extracted Value',
      'Expected Value',
      'Explanation',
      'Suggested Action',
    ];

    const rows = issues.map((iss) => [
      iss.invoiceNumber,
      iss.vendorName,
      iss.ruleId,
      iss.ruleTitle,
      iss.severity.toUpperCase(),
      iss.field,
      iss.extractedValue,
      iss.expectedValue || 'N/A',
      iss.explanation,
      iss.suggestedAction,
    ]);

    const csv = this.toCSV(headers, rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    this.triggerDownload(blob, filename);
  }

  /**
   * Export review queue as CSV
   */
  static exportReviewQueueCSV(invoices: Invoice[], filename = 'invoxis_review_queue.csv'): void {
    const reviewItems = invoices.filter((i) => i.reviewStatus === 'pending' || i.reviewStatus === 'in_review');
    const headers = [
      'Invoice Number',
      'Vendor Name',
      'Total Amount',
      'Currency',
      'Review Status',
      'Assigned Reviewer',
      'Due Date',
      'Last Updated',
    ];

    const rows = reviewItems.map((inv) => [
      inv.invoiceNumber,
      inv.vendorName,
      inv.grandTotal,
      inv.currency,
      inv.reviewStatus,
      inv.assignedReviewer || 'Unassigned',
      inv.dueDate,
      inv.lastUpdated,
    ]);

    const csv = this.toCSV(headers, rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    this.triggerDownload(blob, filename);
  }

  /**
   * Full Excel Workbook (.xlsx) export with multiple worksheets:
   * 1. Invoices
   * 2. Line Items
   * 3. Validation Issues
   */
  static exportFullExcelWorkbook(
    invoices: Invoice[],
    issues: ValidationIssue[],
    filename = 'INVOXIS_Financial_Data_Package.xlsx'
  ): void {
    try {
      const wb = XLSX.utils.book_new();

      // Sheet 1: Invoices
      const invoicesData = invoices.map((inv) => ({
        'Invoice Number': inv.invoiceNumber,
        'Vendor Name': inv.vendorName,
        'Invoice Date': inv.invoiceDate,
        'Due Date': inv.dueDate,
        'Currency': inv.currency,
        'Subtotal': inv.subtotal,
        'Tax Amount': inv.taxAmount,
        'Discount': inv.discount,
        'Shipping': inv.shippingCharges,
        'Grand Total': inv.grandTotal,
        'Processing Status': inv.processingStatus,
        'Validation Status': inv.validationStatus,
        'Review Status': inv.reviewStatus,
        'Assigned Reviewer': inv.assignedReviewer || 'Unassigned',
        'Payment Terms': inv.paymentTerms,
        'Payment Reference': inv.paymentReference,
        'File Name': inv.fileName,
      }));
      const wsInvoices = XLSX.utils.json_to_sheet(invoicesData);
      XLSX.utils.book_append_sheet(wb, wsInvoices, 'Invoices');

      // Sheet 2: Line Items
      const lineItemsData: Record<string, string | number>[] = [];
      invoices.forEach((inv) => {
        inv.lineItems.forEach((item) => {
          lineItemsData.push({
            'Invoice Number': inv.invoiceNumber,
            'Vendor': inv.vendorName,
            'Description': item.description,
            'Quantity': item.quantity,
            'Unit Price': item.unitPrice,
            'Discount': item.discount,
            'Tax Rate %': item.taxRate,
            'Line Total': item.lineTotal,
            'Currency': inv.currency,
          });
        });
      });
      const wsItems = XLSX.utils.json_to_sheet(lineItemsData);
      XLSX.utils.book_append_sheet(wb, wsItems, 'Line Items');

      // Sheet 3: Validation Issues
      const issuesData = issues.map((iss) => ({
        'Invoice #': iss.invoiceNumber,
        'Vendor': iss.vendorName,
        'Rule': iss.ruleTitle,
        'Severity': iss.severity.toUpperCase(),
        'Field': iss.field,
        'Extracted Value': iss.extractedValue,
        'Expected Value': iss.expectedValue || 'N/A',
        'Explanation': iss.explanation,
        'Suggested Action': iss.suggestedAction,
      }));
      const wsIssues = XLSX.utils.json_to_sheet(issuesData);
      XLSX.utils.book_append_sheet(wb, wsIssues, 'Validation Issues');

      // Generate buffer and trigger download
      XLSX.writeFile(wb, filename);
    } catch (err) {
      console.error('Failed to generate Excel workbook:', err);
      // Fallback to CSV if any error occurs
      this.exportInvoicesCSV(invoices);
    }
  }

  /**
   * Generates a structured Audit & Validation text report
   */
  static downloadValidationReport(invoices: Invoice[], issues: ValidationIssue[]): void {
    const timestamp = new Date().toISOString();
    const passed = invoices.filter((i) => !issues.some((iss) => iss.invoiceId === i.id)).length;
    const critical = issues.filter((i) => i.severity === 'critical').length;
    const warning = issues.filter((i) => i.severity === 'warning').length;

    let text = `================================================================================
INVOXIS AI - FINANCIAL DOCUMENT VALIDATION & COMPLIANCE REPORT
Generated: ${timestamp}
Environment: Local Frontend Prototype (Simulated Validation Engine)
================================================================================

1. EXECUTIVE SUMMARY
--------------------------------------------------------------------------------
Total Documents Ingested:    ${invoices.length}
Documents Passed Valid:     ${passed} (${((passed / (invoices.length || 1)) * 100).toFixed(1)}%)
Critical Action Required:   ${critical}
Audit Warnings Detected:    ${warning}

2. VALIDATION ISSUES BREAKDOWN
--------------------------------------------------------------------------------
`;

    if (issues.length === 0) {
      text += `No discrepancy issues detected. All financial calculations align within rounding tolerance.\n`;
    } else {
      issues.forEach((iss, idx) => {
        text += `\n[ISSUE #${idx + 1}] - ${iss.severity.toUpperCase()}
Invoice:         ${iss.invoiceNumber} (${iss.vendorName})
Rule ID:         ${iss.ruleId} - ${iss.ruleTitle}
Field:           ${iss.field}
Recorded Value:  ${iss.extractedValue}
Expected Value:  ${iss.expectedValue || 'N/A'}
Details:         ${iss.explanation}
Recommendation:  ${iss.suggestedAction}
--------------------------------------------------------------------------------`;
      });
    }

    text += `\n\n================================================================================
END OF REPORT - INVOXIS AI ENTERPRISE
================================================================================\n`;

    const blob = new Blob([text], { type: 'text/plain;charset=utf-8;' });
    this.triggerDownload(blob, `INVOXIS_Validation_Report_${formatDate(new Date().toISOString(), 'YYYY-MM-DD')}.txt`);
  }
}
