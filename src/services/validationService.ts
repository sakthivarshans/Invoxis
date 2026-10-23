import { Invoice, ValidationIssue } from '../types/invoice';
import { runInvoiceValidation } from '../utils/calculations';

export interface ValidationSummaryStats {
  totalInvoices: number;
  passedValidations: number;
  warningsCount: number;
  criticalIssuesCount: number;
  totalIssuesCount: number;
  issuesByRule: Record<string, number>;
}

export class ValidationService {
  /**
   * Runs validation on a single invoice
   */
  static validateInvoice(
    invoice: Invoice,
    tolerance: number = 0.02,
    allInvoices: Invoice[] = []
  ): ValidationIssue[] {
    return runInvoiceValidation(invoice, tolerance, allInvoices);
  }

  /**
   * Runs validation across all invoices in the system
   */
  static validateAllInvoices(
    invoices: Invoice[],
    tolerance: number = 0.02
  ): { issues: ValidationIssue[]; stats: ValidationSummaryStats } {
    let allIssues: ValidationIssue[] = [];
    let criticalCount = 0;
    let warningCount = 0;
    let passedCount = 0;
    const issuesByRule: Record<string, number> = {};

    invoices.forEach((inv) => {
      // If invoice failed upload OCR completely, mark as critical
      if (inv.processingStatus === 'failed') {
        const failedIssue: ValidationIssue = {
          id: `${inv.id}-ocr-failure`,
          invoiceId: inv.id,
          invoiceNumber: inv.invoiceNumber || 'Unknown',
          vendorName: inv.vendorName || 'Unparsed File',
          ruleId: 'JOB_EXTRACTION_FAILURE',
          ruleTitle: 'Extraction Pipeline Failure',
          field: 'processingStatus',
          extractedValue: 'Failed',
          expectedValue: 'Completed',
          severity: 'critical',
          explanation: inv.errorMessage || 'Optical recognition failed to parse document boundaries.',
          suggestedAction: 'Upload clearer PDF or trigger manual extraction transcription.',
        };
        allIssues.push(failedIssue);
        criticalCount++;
        issuesByRule['JOB_EXTRACTION_FAILURE'] = (issuesByRule['JOB_EXTRACTION_FAILURE'] || 0) + 1;
        return;
      }

      const invoiceIssues = this.validateInvoice(inv, tolerance, invoices);
      if (invoiceIssues.length === 0) {
        passedCount++;
      } else {
        const hasCritical = invoiceIssues.some((i) => i.severity === 'critical');
        if (hasCritical) {
          criticalCount++;
        } else {
          warningCount++;
        }

        invoiceIssues.forEach((issue) => {
          issuesByRule[issue.ruleId] = (issuesByRule[issue.ruleId] || 0) + 1;
        });

        allIssues = allIssues.concat(invoiceIssues);
      }
    });

    return {
      issues: allIssues,
      stats: {
        totalInvoices: invoices.length,
        passedValidations: passedCount,
        warningsCount: warningCount,
        criticalIssuesCount: criticalCount,
        totalIssuesCount: allIssues.length,
        issuesByRule,
      },
    };
  }
}
