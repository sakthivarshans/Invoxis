import { API_BASE_URL } from '../config';
import { Invoice, LineItem, ReviewStatus, AuditEvent, ValidationIssue } from '../types/invoice';
import type { IInvoiceService } from './invoiceService';
import { ValidationSummaryStats } from './validationService';
import { request, ApiError } from './api/httpClient';
import { AuditDto, HealthDto, InvoiceDto, IssueDto, PageDto, UploadResultDto, ValidationReportDto } from './api/dto';
import { buildInvoicePatch, mapAudit, mapInvoice, mapIssue, mapStats, reviewActionFor } from './api/mappers';

export interface UploadOutcome {
  filename: string;
  accepted: boolean;
  invoiceId?: string;
  status?: string;
  errorCode?: string;
  errorMessage?: string;
}

const PAGE = 200;

async function fetchAll<T>(path: string, query: Record<string, string | number | boolean> = {}): Promise<T[]> {
  const out: T[] = [];
  for (let page = 1; page <= 50; page++) {
    const res = await request<PageDto<T>>(path, { query: { ...query, page, page_size: PAGE } });
    out.push(...res.items);
    if (out.length >= res.total || res.items.length === 0) break;
  }
  return out;
}

/** Real persistence via FastAPI. Never falls back to mock data; errors propagate as ApiError. */
export class BackendInvoiceService implements IInvoiceService {
  /** Last server copy of each invoice: the baseline for diff-based PATCH + optimistic concurrency. */
  private raw = new Map<string, InvoiceDto>();

  private remember(d: InvoiceDto): Invoice {
    this.raw.set(d.id, d);
    return mapInvoice(d);
  }

  async getAllInvoices(): Promise<Invoice[]> {
    const items = await fetchAll<InvoiceDto>('/invoices');
    this.raw = new Map(items.map((d) => [d.id, d]));
    return items.map(mapInvoice);
  }

  async getInvoiceById(id: string): Promise<Invoice | null> {
    try {
      return this.remember(await request<InvoiceDto>(`/invoices/${encodeURIComponent(id)}`));
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) return null;
      throw e;
    }
  }

  async updateInvoice(id: string, updates: Partial<Invoice>): Promise<Invoice> {
    const baseline = this.raw.get(id) ?? (await request<InvoiceDto>(`/invoices/${encodeURIComponent(id)}`));
    const patch = buildInvoicePatch(baseline, updates);
    if (!patch) return this.remember(baseline); // nothing actually changed
    const updated = await request<InvoiceDto>(`/invoices/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: { ...patch, expected_version: baseline.version },
    });
    return this.remember(updated);
  }

  async updateReviewStatus(id: string, newStatus: ReviewStatus, _actor: string, comment: string): Promise<Invoice> {
    // The acting identity is decided by the server (no auth in this version); `_actor` is intentionally unused.
    const current = (this.raw.get(id)?.review_status ?? 'pending') as ReviewStatus;
    const updated = await request<InvoiceDto>(`/invoices/${encodeURIComponent(id)}/review`, {
      method: 'POST',
      body: { action: reviewActionFor(current, newStatus), comment: comment || null },
    });
    return this.remember(updated);
  }

  async addInvoice(_invoice: Invoice): Promise<Invoice> {
    throw new Error('Invoices are created by uploading a PDF in backend mode.');
  }

  async deleteInvoice(id: string): Promise<boolean> {
    await request<void>(`/invoices/${encodeURIComponent(id)}`, { method: 'DELETE' });
    this.raw.delete(id);
    return true;
  }

  async resetToDefaultMockData(): Promise<Invoice[]> {
    throw new Error('Demo data reset is not available in backend mode.');
  }

  // ------------------------------------------------------------------ backend-only operations
  async uploadDocuments(files: File[]): Promise<UploadOutcome[]> {
    const form = new FormData();
    files.forEach((f) => form.append('files', f, f.name));
    try {
      const res = await request<{ results: UploadResultDto[] }>('/documents/upload', { method: 'POST', form });
      return res.results.map(toOutcome);
    } catch (e) {
      // Whole-request rejections (e.g. single oversize/invalid/duplicate file) carry one error for the batch.
      if (e instanceof ApiError && e.status !== 0 && files.length === 1) {
        return [{ filename: files[0].name, accepted: false, errorCode: e.code, errorMessage: e.message }];
      }
      if (e instanceof ApiError && Array.isArray(e.details)) {
        return (e.details as Array<{ filename: string; error_code: string; error_message: string }>).map((d) => ({
          filename: d.filename, accepted: false, errorCode: d.error_code, errorMessage: d.error_message,
        }));
      }
      throw e;
    }
  }

  async retryProcessing(invoiceId: string): Promise<void> {
    const documentId = this.raw.get(invoiceId)?.document_id;
    if (!documentId) throw new Error('This invoice has no source document to retry.');
    await request(`/documents/${encodeURIComponent(documentId)}/retry`, { method: 'POST' });
  }

  async validateInvoice(invoiceId: string, tolerance?: number): Promise<void> {
    await request(`/invoices/${encodeURIComponent(invoiceId)}/validate`, {
      method: 'POST',
      body: tolerance === undefined ? {} : { tolerance: String(tolerance) },
    });
  }

  async fetchIssues(): Promise<ValidationIssue[]> {
    return (await fetchAll<IssueDto>('/validation/issues')).map(mapIssue);
  }

  async fetchStats(): Promise<ValidationSummaryStats> {
    return mapStats(await request<ValidationReportDto>('/reports/validation'));
  }

  async fetchAuditLogs(): Promise<AuditEvent[]> {
    const res = await request<PageDto<AuditDto>>('/audit-logs', { query: { page: 1, page_size: PAGE } });
    return res.items.map(mapAudit);
  }

  async health(): Promise<HealthDto> {
    return request<HealthDto>('/health');
  }

  documentFileUrl(documentId: string): string {
    return `${API_BASE_URL}/documents/${encodeURIComponent(documentId)}/file`;
  }
}

function toOutcome(r: UploadResultDto): UploadOutcome {
  return {
    filename: r.filename,
    accepted: r.accepted,
    invoiceId: r.invoice_id ?? undefined,
    status: r.status ?? undefined,
    errorCode: r.error_code ?? undefined,
    errorMessage: r.error_message ?? undefined,
  };
}

export type { LineItem };
