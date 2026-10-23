/** Shapes returned by the FastAPI backend (snake_case; Decimals arrive as strings; nulls are meaningful). */
export interface PageDto<T> { items: T[]; total: number; page: number; page_size: number }

export interface LineItemDto {
  id: string; position: number; description: string | null;
  quantity: string | null; unit_price: string | null; discount: string | null;
  discount_percent: string | null; tax_rate: string | null; line_total: string | null;
  page: number | null; is_manually_edited: boolean;
}
export interface ReviewHistoryDto {
  id: string; action: string; previous_status: string; new_status: string;
  comment: string | null; actor: string; created_at: string;
}
export interface InvoiceDto {
  id: string; document_id: string | null; file_name: string | null; file_size: number | null;
  page_count: number | null; has_file: boolean; version: number;
  processing_status: string; validation_status: string; review_status: string;
  error_message: string | null; assigned_reviewer: string | null;
  invoice_number: string | null; invoice_date: string | null; due_date: string | null;
  vendor_name: string | null; vendor_address: string | null; vendor_tax_id: string | null;
  vendor_email: string | null; vendor_phone: string | null;
  customer_name: string | null; customer_address: string | null; customer_tax_id: string | null;
  currency: string | null;
  subtotal: string | null; tax_amount: string | null; discount: string | null;
  shipping_charges: string | null; grand_total: string | null;
  payment_terms: string | null; payment_reference: string | null;
  line_items: LineItemDto[]; field_warnings: Record<string, { reason: string; detail?: string; raw?: string }> | null;
  needs_verification: boolean; is_manually_edited: boolean; duplicate_of_id: string | null;
  is_archived: boolean; review_history: ReviewHistoryDto[]; created_at: string; updated_at: string;
}
export interface IssueDto {
  id: string; invoice_id: string; rule_code: string; rule_title: string; field: string | null;
  severity: 'critical' | 'warning' | 'info'; category: string; actual_value: string | null;
  expected_value: string | null; explanation: string; recommended_action: string;
  invoice_number: string | null; vendor_name: string | null;
}
export interface AuditDto {
  id: string; created_at: string; action: string; category: string; invoice_id: string | null;
  invoice_number: string | null; actor: string; description: string; details: unknown;
}
export interface ValidationReportDto {
  total_invoices: number; passed: number; warning_invoices: number; critical_invoices: number;
  total_issues: number; issues_by_rule: Record<string, number>; issues_by_severity: Record<string, number>;
}
export interface UploadResultDto {
  filename: string; accepted: boolean; document_id: string | null; invoice_id: string | null;
  status: string | null; error_code: string | null; error_message: string | null;
}
export interface HealthDto {
  status: string; database: string; environment: string;
  extraction: { configured: boolean; provider: string; model: string | null; vision_model: string | null };
}
