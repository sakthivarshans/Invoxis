export type ProcessingStatus = 'queued' | 'processing' | 'completed' | 'needs_review' | 'failed';
export type ValidationStatus = 'valid' | 'warning' | 'critical' | 'unvalidated';
export type ReviewStatus = 'pending' | 'in_review' | 'approved' | 'rejected' | 'returned_for_correction';
export type FieldConfidenceStatus = 'high' | 'medium' | 'low' | 'manual';

export interface LineItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  discount: number; // fixed or percentage discount deduction
  taxRate: number; // percentage, e.g. 10 for 10%
  lineTotal: number;
  isManuallyEdited?: boolean;
}

export interface ReviewActionRecord {
  id: string;
  timestamp: string;
  actor: string;
  action: 'marked_in_review' | 'approved' | 'rejected' | 'returned_for_correction' | 'note_added';
  comment: string;
  previousStatus: ReviewStatus;
  newStatus: ReviewStatus;
}

export interface Invoice {
  id: string;
  fileName: string;
  fileSize: number; // in bytes
  uploadDate: string;
  
  // Status flags
  processingStatus: ProcessingStatus;
  validationStatus: ValidationStatus;
  reviewStatus: ReviewStatus;
  errorMessage?: string;
  
  // Overall simulated confidence
  overallConfidence: number; // e.g. 96.5%
  
  // Header & Vendor / Customer Info
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  
  vendorName: string;
  vendorAddress: string;
  vendorTaxId: string;
  vendorEmail?: string;
  vendorPhone?: string;
  
  customerName: string;
  customerAddress: string;
  customerTaxId: string;
  
  // Financial Summary
  currency: string; // 'USD', 'EUR', 'GBP', etc.
  subtotal: number;
  taxAmount: number;
  discount: number;
  shippingCharges: number;
  grandTotal: number;
  
  paymentTerms: string;
  paymentReference: string;
  
  // Items
  lineItems: LineItem[];
  
  // Workflow & Review
  assignedReviewer?: string;
  reviewHistory: ReviewActionRecord[];
  
  // Metadata for preview simulation
  pageCount: number;
  isDuplicateCandidate?: boolean;
  duplicateOfId?: string;
  lastUpdated: string;
  isManuallyEdited?: boolean;

  // Backend-mode only (undefined in demo mode)
  version?: number; // optimistic-concurrency token
  documentId?: string; // source PDF record
  fieldWarnings?: Record<string, { reason: string; detail?: string; raw?: string }>; // extractor "needs verification" flags
  needsVerification?: boolean;
}

export interface ValidationIssue {
  id: string;
  invoiceId: string;
  invoiceNumber: string;
  vendorName: string;
  ruleId: string;
  ruleTitle: string;
  field: string;
  extractedValue: string;
  expectedValue?: string;
  severity: 'critical' | 'warning' | 'info';
  explanation: string;
  suggestedAction: string;
}

export interface AuditEvent {
  id: string;
  timestamp: string;
  action: string;
  invoiceId?: string;
  invoiceNumber?: string;
  actor: string;
  description: string;
  category: 'upload' | 'extraction' | 'validation' | 'review' | 'system' | 'settings';
}

export interface AppSettings {
  workspaceName: string;
  defaultCurrency: string;
  dateFormat: string;
  timeZone: string;
  pageSize: number;
  confidenceThreshold: number;
  roundingTolerance: number;
  duplicateDetectionEnabled: boolean;
  requiredFields: string[];
}
