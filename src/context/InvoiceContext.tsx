import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef, ReactNode } from 'react';
import { Invoice, ValidationIssue, AuditEvent, AppSettings, ReviewStatus } from '../types/invoice';
import { invoiceService, backendService } from '../services/invoiceService';
import type { UploadOutcome } from '../services/backendInvoiceService';
import { ApiError, describeError } from '../services/api/httpClient';
import { IS_BACKEND, AppMode, APP_MODE } from '../config';
import { useToast } from './ToastContext';
import { ValidationService, ValidationSummaryStats } from '../services/validationService';
import { INITIAL_AUDIT_LOGS } from '../data/initialAuditLogs';

const SETTINGS_STORAGE_KEY = 'invoxis_settings_v1';
const AUDIT_STORAGE_KEY = 'invoxis_audit_v1';

export const DEFAULT_SETTINGS: AppSettings = {
  workspaceName: 'Global Finance & Operations',
  defaultCurrency: 'USD',
  dateFormat: 'YYYY-MM-DD',
  timeZone: 'UTC',
  pageSize: 10,
  confidenceThreshold: 90,
  roundingTolerance: 0.02,
  duplicateDetectionEnabled: true,
  requiredFields: ['invoiceNumber', 'vendorName', 'invoiceDate', 'currency', 'grandTotal'],
};

interface InvoiceContextValue {
  invoices: Invoice[];
  isLoading: boolean;
  validationIssues: ValidationIssue[];
  validationStats: ValidationSummaryStats;
  auditLogs: AuditEvent[];
  settings: AppSettings;
  
  // Actions
  getInvoice: (id: string) => Invoice | undefined;
  updateInvoiceData: (id: string, updates: Partial<Invoice>) => Promise<Invoice>;
  changeReviewStatus: (id: string, newStatus: ReviewStatus, actor: string, comment: string) => Promise<Invoice>;
  addNewInvoice: (invoice: Invoice) => Promise<Invoice>;
  removeInvoice: (id: string) => Promise<void>;
  updateAppSettings: (newSettings: Partial<AppSettings>) => void;
  resetToDefaults: () => Promise<void>;
  logAudit: (
    action: string,
    category: AuditEvent['category'],
    description: string,
    invoiceId?: string,
    invoiceNumber?: string,
    actor?: string
  ) => void;
  runValidationCheck: () => Promise<void>;

  // Backend-mode operations (in demo mode these reject with a clear message; UI only calls them in backend mode)
  mode: AppMode;
  loadError: string | null;
  refresh: () => Promise<void>;
  uploadDocuments: (files: File[]) => Promise<UploadOutcome[]>;
  retryProcessing: (id: string) => Promise<void>;
  validateInvoice: (id: string) => Promise<void>;
}

const EMPTY_STATS: ValidationSummaryStats = {
  totalInvoices: 0, passedValidations: 0, warningsCount: 0, criticalIssuesCount: 0, totalIssuesCount: 0, issuesByRule: {},
};
const backendOnly = (): never => {
  throw new Error('This operation is only available in backend mode.');
};

const InvoiceContext = createContext<InvoiceContextValue | undefined>(undefined);

export const InvoiceProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const toast = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [backendIssues, setBackendIssues] = useState<ValidationIssue[]>([]);
  const [backendStats, setBackendStats] = useState<ValidationSummaryStats>(EMPTY_STATS);
  const [settings, setSettings] = useState<AppSettings>(() => {
    try {
      const stored = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (stored) return JSON.parse(stored);
    } catch (e) {
      console.warn('Failed to load settings:', e);
    }
    return DEFAULT_SETTINGS;
  });

  // Backend mode never shows demo/mock audit history: the audit trail is whatever the server recorded.
  const [auditLogs, setAuditLogs] = useState<AuditEvent[]>(() => {
    if (IS_BACKEND) return [];
    try {
      const stored = localStorage.getItem(AUDIT_STORAGE_KEY);
      if (stored) return JSON.parse(stored);
    } catch (e) {
      console.warn('Failed to load audit logs:', e);
    }
    return INITIAL_AUDIT_LOGS;
  });

  // ---- backend synchronisation -------------------------------------------------------------
  // Every refresh gets a sequence number; only the newest may write state, so a slow older response
  // can never overwrite newer server data (or a just-completed mutation).
  const refreshSeq = useRef(0);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const refreshBackend = useCallback(async (opts: { silent?: boolean } = {}) => {
    if (!backendService) return;
    const seq = ++refreshSeq.current;
    if (!opts.silent) setIsLoading(true);
    try {
      const [inv, issues, stats, audit] = await Promise.all([
        backendService.getAllInvoices(),
        backendService.fetchIssues(),
        backendService.fetchStats(),
        backendService.fetchAuditLogs(),
      ]);
      if (seq !== refreshSeq.current) return; // superseded
      setInvoices(inv);
      setBackendIssues(issues);
      setBackendStats(stats);
      setAuditLogs(audit);
      setLoadError(null);
    } catch (err) {
      if (seq !== refreshSeq.current) return;
      // Keep whatever real data we last fetched, but say plainly that it may be out of date.
      setLoadError(describeError(err));
    } finally {
      if (seq === refreshSeq.current) setIsLoading(false);
    }
  }, []);

  /** Run a backend mutation: surface the server's exact error, resync on conflicts, then rethrow. */
  const guard = useCallback(
    async <T,>(fn: () => Promise<T>): Promise<T> => {
      try {
        const result = await fn();
        if (IS_BACKEND) {
          refreshSeq.current++; // discard any in-flight older refresh
          void refreshBackend({ silent: true });
        }
        return result;
      } catch (err) {
        if (IS_BACKEND) {
          toastRef.current.error('Request failed', describeError(err));
          if (err instanceof ApiError && err.status === 409) void refreshBackend({ silent: true });
        }
        throw err;
      }
    },
    [refreshBackend]
  );

  useEffect(() => {
    if (IS_BACKEND) {
      void refreshBackend();
      return;
    }
    const load = async () => {
      setIsLoading(true);
      try {
        const data = await invoiceService.getAllInvoices();
        setInvoices(data);
      } catch (err) {
        console.error('Failed to load invoices:', err);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [refreshBackend]);

  // Poll while any document is still being processed by the server.
  const hasActiveJobs = invoices.some((i) => i.processingStatus === 'queued' || i.processingStatus === 'processing');
  useEffect(() => {
    if (!IS_BACKEND || !hasActiveJobs) return;
    const t = setInterval(() => void refreshBackend({ silent: true }), 2000);
    return () => clearInterval(t);
  }, [hasActiveJobs, refreshBackend]);

  const saveAuditLogs = useCallback((logs: AuditEvent[]) => {
    setAuditLogs(logs);
    try {
      localStorage.setItem(AUDIT_STORAGE_KEY, JSON.stringify(logs));
    } catch (e) {
      console.warn('Failed to save audit logs:', e);
    }
  }, []);

  const logAudit = useCallback(
    (
      action: string,
      category: AuditEvent['category'],
      description: string,
      invoiceId?: string,
      invoiceNumber?: string,
      actor: string = 'Finance Workspace'
    ) => {
      if (IS_BACKEND) return; // the server records its own audit events; the client never fabricates them
      const newEvent: AuditEvent = {
        id: `audit-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        timestamp: new Date().toISOString(),
        action,
        invoiceId,
        invoiceNumber,
        actor,
        description,
        category,
      };
      saveAuditLogs([newEvent, ...auditLogs]);
    },
    [auditLogs, saveAuditLogs]
  );

  // Demo mode: compute validation locally (existing behaviour). Backend mode: use persisted results.
  const localValidation = useMemo(
    () =>
      IS_BACKEND
        ? { issues: [] as ValidationIssue[], stats: EMPTY_STATS }
        : ValidationService.validateAllInvoices(invoices, settings.roundingTolerance),
    [invoices, settings.roundingTolerance]
  );
  const validationIssues = IS_BACKEND ? backendIssues : localValidation.issues;
  const validationStats = IS_BACKEND ? backendStats : localValidation.stats;

  const getInvoice = useCallback((id: string) => invoices.find((inv) => inv.id === id), [invoices]);

  const updateInvoiceData = useCallback(
    async (id: string, updates: Partial<Invoice>): Promise<Invoice> =>
      guard(async () => {
        const updated = await invoiceService.updateInvoice(id, updates);
        setInvoices((prev) => prev.map((inv) => (inv.id === id ? updated : inv)));
        logAudit(
          'INVOICE_FIELDS_MODIFIED',
          'extraction',
          `Invoice ${updated.invoiceNumber || id} details or line items manually edited.`,
          updated.id,
          updated.invoiceNumber
        );
        return updated;
      }),
    [guard, logAudit]
  );

  const changeReviewStatus = useCallback(
    async (id: string, newStatus: ReviewStatus, actor: string, comment: string): Promise<Invoice> =>
      guard(async () => {
        const updated = await invoiceService.updateReviewStatus(id, newStatus, actor, comment);
        setInvoices((prev) => prev.map((inv) => (inv.id === id ? updated : inv)));

        const actionLabel =
          newStatus === 'approved'
            ? 'INVOICE_APPROVED'
            : newStatus === 'rejected'
            ? 'INVOICE_REJECTED'
            : newStatus === 'in_review'
            ? 'INVOICE_IN_REVIEW'
            : 'INVOICE_RETURNED_FOR_CORRECTION';

        logAudit(
          actionLabel,
          'review',
          `Invoice ${updated.invoiceNumber} status set to "${newStatus.replace(/_/g, ' ').toUpperCase()}" by ${actor}: ${comment || 'No comment provided'}`,
          updated.id,
          updated.invoiceNumber,
          actor
        );
        return updated;
      }),
    [guard, logAudit]
  );

  const addNewInvoice = useCallback(
    async (invoice: Invoice): Promise<Invoice> =>
      guard(async () => {
        const created = await invoiceService.addInvoice(invoice);
        setInvoices((prev) => [created, ...prev]);
        logAudit(
          'DOCUMENT_INTAKE_PROCESSED',
          'upload',
          `Document ${created.fileName} intake complete. Simulated confidence ${created.overallConfidence}%.`,
          created.id,
          created.invoiceNumber
        );
        return created;
      }),
    [guard, logAudit]
  );

  const removeInvoice = useCallback(
    async (id: string) =>
      guard(async () => {
        const target = invoices.find((i) => i.id === id);
        await invoiceService.deleteInvoice(id);
        setInvoices((prev) => prev.filter((i) => i.id !== id));
        if (target) {
          logAudit(
            'DOCUMENT_REMOVED',
            'system',
            `Document ${target.fileName} (${target.invoiceNumber || id}) deleted from queue.`,
            id,
            target.invoiceNumber
          );
        }
      }),
    [guard, invoices, logAudit]
  );

  const updateAppSettings = useCallback((newSettings: Partial<AppSettings>) => {
    setSettings((prev) => {
      const updated = { ...prev, ...newSettings };
      try {
        localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(updated));
      } catch (e) {
        console.warn('Failed to save settings:', e);
      }
      return updated;
    });
  }, []);

  const resetToDefaults = useCallback(async () => {
    if (IS_BACKEND) {
      throw new Error('Resetting demo data is disabled in backend mode (it would not touch server data).');
    }
    setIsLoading(true);
    const defaults = await invoiceService.resetToDefaultMockData();
    setInvoices(defaults);
    setSettings(DEFAULT_SETTINGS);
    saveAuditLogs(INITIAL_AUDIT_LOGS);
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(DEFAULT_SETTINGS));
      localStorage.setItem(AUDIT_STORAGE_KEY, JSON.stringify(INITIAL_AUDIT_LOGS));
    } catch (e) {
      console.warn(e);
    }
    setIsLoading(false);
  }, [saveAuditLogs]);

  const runValidationCheck = useCallback(async () => {
    if (!IS_BACKEND || !backendService) {
      // Demo: re-evaluates state and updates invoices if needed
      setInvoices((prev) => [...prev]);
      return;
    }
    // Backend: genuinely re-run the server-side rules on every extracted invoice, using the UI tolerance.
    const targets = invoices.filter((i) => i.processingStatus === 'completed' || i.processingStatus === 'needs_review');
    await guard(async () => {
      for (const inv of targets) {
        await backendService!.validateInvoice(inv.id, settingsRef.current.roundingTolerance);
      }
    });
  }, [guard, invoices]);

  const uploadDocuments = useCallback(
    async (files: File[]): Promise<UploadOutcome[]> =>
      IS_BACKEND && backendService ? guard(() => backendService!.uploadDocuments(files)) : backendOnly(),
    [guard]
  );

  const retryProcessing = useCallback(
    async (id: string): Promise<void> =>
      IS_BACKEND && backendService ? guard(() => backendService!.retryProcessing(id)) : backendOnly(),
    [guard]
  );

  const validateInvoice = useCallback(
    async (id: string): Promise<void> =>
      IS_BACKEND && backendService
        ? guard(() => backendService!.validateInvoice(id, settingsRef.current.roundingTolerance))
        : backendOnly(),
    [guard]
  );

  const refresh = useCallback(async () => {
    if (IS_BACKEND) await refreshBackend();
  }, [refreshBackend]);

  return (
    <InvoiceContext.Provider
      value={{
        invoices,
        isLoading,
        validationIssues,
        validationStats,
        auditLogs,
        settings,
        getInvoice,
        updateInvoiceData,
        changeReviewStatus,
        addNewInvoice,
        removeInvoice,
        updateAppSettings,
        resetToDefaults,
        logAudit,
        runValidationCheck,
        mode: APP_MODE,
        loadError,
        refresh,
        uploadDocuments,
        retryProcessing,
        validateInvoice,
      }}
    >
      {children}
    </InvoiceContext.Provider>
  );
};

export const useInvoices = (): InvoiceContextValue => {
  const context = useContext(InvoiceContext);
  if (!context) {
    throw new Error('useInvoices must be used within an InvoiceProvider');
  }
  return context;
};
