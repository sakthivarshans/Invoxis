import { Invoice, ReviewStatus } from '../types/invoice';
import { INITIAL_MOCK_INVOICES } from '../data/mockInvoices';
import { IS_BACKEND } from '../config';
import { BackendInvoiceService } from './backendInvoiceService';

const STORAGE_KEY = 'invoxis_invoices_v1';

export interface IInvoiceService {
  getAllInvoices(): Promise<Invoice[]>;
  getInvoiceById(id: string): Promise<Invoice | null>;
  updateInvoice(id: string, updates: Partial<Invoice>): Promise<Invoice>;
  updateReviewStatus(id: string, newStatus: ReviewStatus, actor: string, comment: string): Promise<Invoice>;
  addInvoice(invoice: Invoice): Promise<Invoice>;
  deleteInvoice(id: string): Promise<boolean>;
  resetToDefaultMockData(): Promise<Invoice[]>;
}

/**
 * Frontend Invoice Service with LocalStorage persistence.
 * Ready for future FastAPI backend replacement by swapping this implementation with HTTP calls.
 */
class LocalInvoiceService implements IInvoiceService {
  private loadInvoices(): Invoice[] {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (e) {
      console.warn('Failed to load invoices from localStorage:', e);
    }
    // Default fallback
    this.saveInvoices(INITIAL_MOCK_INVOICES);
    return INITIAL_MOCK_INVOICES;
  }

  private saveInvoices(invoices: Invoice[]): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(invoices));
    } catch (e) {
      console.warn('Failed to save invoices to localStorage:', e);
    }
  }

  async getAllInvoices(): Promise<Invoice[]> {
    return this.loadInvoices();
  }

  async getInvoiceById(id: string): Promise<Invoice | null> {
    const invoices = this.loadInvoices();
    return invoices.find((inv) => inv.id === id) || null;
  }

  async updateInvoice(id: string, updates: Partial<Invoice>): Promise<Invoice> {
    const invoices = this.loadInvoices();
    const index = invoices.findIndex((inv) => inv.id === id);
    if (index === -1) {
      throw new Error(`Invoice with id ${id} not found.`);
    }

    const updated: Invoice = {
      ...invoices[index],
      ...updates,
      lastUpdated: new Date().toISOString(),
      isManuallyEdited: true,
    };

    invoices[index] = updated;
    this.saveInvoices(invoices);
    return updated;
  }

  async updateReviewStatus(
    id: string,
    newStatus: ReviewStatus,
    actor: string,
    comment: string
  ): Promise<Invoice> {
    const invoices = this.loadInvoices();
    const index = invoices.findIndex((inv) => inv.id === id);
    if (index === -1) {
      throw new Error(`Invoice with id ${id} not found.`);
    }

    const current = invoices[index];
    const newRecord = {
      id: `rev-${Date.now()}`,
      timestamp: new Date().toISOString(),
      actor,
      action: newStatus === 'approved' ? 'approved' as const :
              newStatus === 'rejected' ? 'rejected' as const :
              newStatus === 'in_review' ? 'marked_in_review' as const :
              newStatus === 'returned_for_correction' ? 'returned_for_correction' as const : 'note_added' as const,
      comment,
      previousStatus: current.reviewStatus,
      newStatus,
    };

    const updated: Invoice = {
      ...current,
      reviewStatus: newStatus,
      assignedReviewer: actor || current.assignedReviewer,
      reviewHistory: [newRecord, ...current.reviewHistory],
      lastUpdated: new Date().toISOString(),
    };

    invoices[index] = updated;
    this.saveInvoices(invoices);
    return updated;
  }

  async addInvoice(invoice: Invoice): Promise<Invoice> {
    const invoices = this.loadInvoices();
    invoices.unshift(invoice);
    this.saveInvoices(invoices);
    return invoice;
  }

  async deleteInvoice(id: string): Promise<boolean> {
    const invoices = this.loadInvoices();
    const filtered = invoices.filter((inv) => inv.id !== id);
    this.saveInvoices(filtered);
    return true;
  }

  async resetToDefaultMockData(): Promise<Invoice[]> {
    this.saveInvoices(INITIAL_MOCK_INVOICES);
    return INITIAL_MOCK_INVOICES;
  }
}

/** Demo mode: localStorage + mock data. Backend mode: FastAPI (selected explicitly via VITE_APP_MODE). */
export const backendService: BackendInvoiceService | null = IS_BACKEND ? new BackendInvoiceService() : null;
export const invoiceService: IInvoiceService = backendService ?? new LocalInvoiceService();
