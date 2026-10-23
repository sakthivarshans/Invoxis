/**
 * Explicit backend <-> frontend mapping.
 *
 * The frontend model has no "null": missing strings are '' and missing numbers are 0. The backend keeps
 * null (absent) distinct from 0. To avoid turning "absent" into a fabricated 0 on save, updates are sent as a
 * DIFF against the last server copy (only changed fields), and unchanged line-item values are echoed back
 * exactly as the server sent them.
 */
import { AuditEvent, Invoice, LineItem, ProcessingStatus, ReviewActionRecord, ReviewStatus, ValidationIssue, ValidationStatus } from '../../types/invoice';
import { AuditDto, InvoiceDto, IssueDto, LineItemDto, ReviewHistoryDto, ValidationReportDto } from './dto';
import { ValidationSummaryStats } from '../validationService';

const num = (s: string | null | undefined): number => (s === null || s === undefined ? 0 : Number(s));
const str = (s: string | null | undefined): string => s ?? '';

export function mapLineItem(d: LineItemDto): LineItem {
  return {
    id: d.id,
    description: str(d.description),
    quantity: num(d.quantity),
    unitPrice: num(d.unit_price),
    discount: num(d.discount),
    taxRate: num(d.tax_rate),
    lineTotal: num(d.line_total),
    isManuallyEdited: d.is_manually_edited,
  };
}

function mapReview(d: ReviewHistoryDto): ReviewActionRecord {
  return {
    id: d.id,
    timestamp: d.created_at,
    actor: d.actor,
    action: d.action as ReviewActionRecord['action'],
    comment: str(d.comment),
    previousStatus: d.previous_status as ReviewStatus,
    newStatus: d.new_status as ReviewStatus,
  };
}

export function mapInvoice(d: InvoiceDto): Invoice {
  return {
    id: d.id,
    fileName: d.file_name ?? '(manual entry)',
    fileSize: d.file_size ?? 0,
    uploadDate: d.created_at,
    processingStatus: d.processing_status as ProcessingStatus,
    validationStatus: d.validation_status as ValidationStatus,
    reviewStatus: d.review_status as ReviewStatus,
    errorMessage: d.error_message ?? undefined,
    overallConfidence: 0, // the backend does not invent a confidence score; UI shows verification flags instead
    invoiceNumber: str(d.invoice_number),
    invoiceDate: str(d.invoice_date),
    dueDate: str(d.due_date),
    vendorName: str(d.vendor_name),
    vendorAddress: str(d.vendor_address),
    vendorTaxId: str(d.vendor_tax_id),
    vendorEmail: d.vendor_email ?? undefined,
    vendorPhone: d.vendor_phone ?? undefined,
    customerName: str(d.customer_name),
    customerAddress: str(d.customer_address),
    customerTaxId: str(d.customer_tax_id),
    currency: str(d.currency),
    subtotal: num(d.subtotal),
    taxAmount: num(d.tax_amount),
    discount: num(d.discount),
    shippingCharges: num(d.shipping_charges),
    grandTotal: num(d.grand_total),
    paymentTerms: str(d.payment_terms),
    paymentReference: str(d.payment_reference),
    lineItems: d.line_items.map(mapLineItem),
    assignedReviewer: d.assigned_reviewer ?? undefined,
    reviewHistory: d.review_history.map(mapReview),
    pageCount: d.page_count ?? 1,
    isDuplicateCandidate: Boolean(d.duplicate_of_id),
    duplicateOfId: d.duplicate_of_id ?? undefined,
    lastUpdated: d.updated_at,
    isManuallyEdited: d.is_manually_edited,
    // backend-only extras (optional on the shared type)
    version: d.version,
    documentId: d.document_id ?? undefined,
    fieldWarnings: d.field_warnings ?? undefined,
    needsVerification: d.needs_verification,
  };
}

export function mapIssue(d: IssueDto): ValidationIssue {
  return {
    id: d.id,
    invoiceId: d.invoice_id,
    invoiceNumber: d.invoice_number || 'Unknown',
    vendorName: d.vendor_name || 'Unknown',
    ruleId: d.rule_code,
    ruleTitle: d.rule_title,
    field: d.field ?? '',
    extractedValue: d.actual_value ?? '—',
    expectedValue: d.expected_value ?? undefined,
    severity: d.severity,
    explanation: d.explanation,
    suggestedAction: d.recommended_action,
  };
}

export function mapAudit(d: AuditDto): AuditEvent {
  return {
    id: d.id,
    timestamp: d.created_at,
    action: d.action,
    invoiceId: d.invoice_id ?? undefined,
    invoiceNumber: d.invoice_number ?? undefined,
    actor: d.actor,
    description: d.description,
    category: d.category as AuditEvent['category'],
  };
}

export function mapStats(r: ValidationReportDto): ValidationSummaryStats {
  return {
    totalInvoices: r.total_invoices,
    passedValidations: r.passed,
    warningsCount: r.warning_invoices,
    criticalIssuesCount: r.critical_invoices,
    totalIssuesCount: r.total_issues,
    issuesByRule: r.issues_by_rule,
  };
}

// ----------------------------------------------------------------------------------- outgoing
const round4 = (n: number) => String(Math.round((n + Number.EPSILON) * 10000) / 10000);

type Kind = 'text' | 'date' | 'currency' | 'money';
const HEADER_FIELDS: Array<[keyof Invoice, string, Kind]> = [
  ['invoiceNumber', 'invoice_number', 'text'], ['invoiceDate', 'invoice_date', 'date'],
  ['dueDate', 'due_date', 'date'], ['vendorName', 'vendor_name', 'text'],
  ['vendorAddress', 'vendor_address', 'text'], ['vendorTaxId', 'vendor_tax_id', 'text'],
  ['vendorEmail', 'vendor_email', 'text'], ['vendorPhone', 'vendor_phone', 'text'],
  ['customerName', 'customer_name', 'text'], ['customerAddress', 'customer_address', 'text'],
  ['customerTaxId', 'customer_tax_id', 'text'], ['currency', 'currency', 'currency'],
  ['subtotal', 'subtotal', 'money'], ['taxAmount', 'tax_amount', 'money'], ['discount', 'discount', 'money'],
  ['shippingCharges', 'shipping_charges', 'money'], ['grandTotal', 'grand_total', 'money'],
  ['paymentTerms', 'payment_terms', 'text'], ['paymentReference', 'payment_reference', 'text'],
];

/** Build a PATCH body containing only what the user actually changed (relative to the server copy). */
export function buildInvoicePatch(
  baseline: InvoiceDto,
  updates: Partial<Invoice>
): Record<string, unknown> | null {
  const base = mapInvoice(baseline);
  const patch: Record<string, unknown> = {};

  for (const [fKey, bKey, kind] of HEADER_FIELDS) {
    if (!(fKey in updates)) continue;
    const next = updates[fKey] as unknown;
    const prev = base[fKey] as unknown;
    if (kind === 'money') {
      if (Number(next) !== Number(prev)) patch[bKey] = round4(Number(next));
    } else {
      const n = (next ?? '') as string;
      const p = (prev ?? '') as string;
      if (n !== p) patch[bKey] = n.trim() === '' ? null : kind === 'currency' ? n.trim().toUpperCase() : n;
    }
  }

  if (updates.lineItems) {
    const baseById = new Map(baseline.line_items.map((l) => [l.id, l]));
    const changed =
      updates.lineItems.length !== base.lineItems.length ||
      updates.lineItems.some((l, i) => JSON.stringify(strip(l)) !== JSON.stringify(strip(base.lineItems[i])));
    if (changed) {
      patch.line_items = updates.lineItems.map((l) => {
        const orig = baseById.get(l.id);
        const keep = (cur: number, o: number, raw: string | null | undefined) =>
          orig && cur === o ? (raw ?? null) : round4(cur);
        const o = orig ? mapLineItem(orig) : undefined;
        return {
          description: orig && l.description === o!.description ? orig.description : l.description || null,
          quantity: keep(l.quantity, o?.quantity ?? NaN, orig?.quantity),
          unit_price: keep(l.unitPrice, o?.unitPrice ?? NaN, orig?.unit_price),
          discount: keep(l.discount, o?.discount ?? NaN, orig?.discount),
          discount_percent: orig?.discount_percent ?? null,
          tax_rate: keep(l.taxRate, o?.taxRate ?? NaN, orig?.tax_rate),
          line_total: keep(l.lineTotal, o?.lineTotal ?? NaN, orig?.line_total),
        };
      });
    }
  }

  return Object.keys(patch).length ? patch : null;
}

const strip = (l: LineItem) => [l.description, l.quantity, l.unitPrice, l.discount, l.taxRate, l.lineTotal];

export function reviewActionFor(
  current: ReviewStatus,
  next: ReviewStatus
): 'marked_in_review' | 'approved' | 'rejected' | 'returned_for_correction' | 'note_added' {
  if (next === current) return 'note_added'; // ReviewPage logs notes by re-sending the current status
  switch (next) {
    case 'approved': return 'approved';
    case 'rejected': return 'rejected';
    case 'returned_for_correction': return 'returned_for_correction';
    default: return 'marked_in_review'; // 'in_review' (and 'pending' has no valid inbound action)
  }
}
