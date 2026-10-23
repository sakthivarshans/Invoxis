import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Save,
  CheckCircle2,
  ShieldAlert,
  Send,
  ArrowLeft,
  ChevronDown,
  Sparkles,
  FileCheck,
  AlertTriangle,
  Download,
} from 'lucide-react';
import { useInvoices } from '../context/InvoiceContext';
import { useToast } from '../context/ToastContext';
import { DocumentPreview } from '../components/extraction/DocumentPreview';
import { InvoiceFieldsForm } from '../components/extraction/InvoiceFieldsForm';
import { LineItemsTable } from '../components/extraction/LineItemsTable';
import { StatusBadge } from '../components/common/StatusBadge';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { ExportService } from '../services/exportService';
import { Invoice, LineItem } from '../types/invoice';
import { ValidationService } from '../services/validationService';
import { IS_BACKEND } from '../config';

export const ExtractionPage: React.FC = () => {
  const { invoiceId } = useParams<{ invoiceId: string }>();
  const navigate = useNavigate();
  const { invoices, updateInvoiceData, changeReviewStatus, settings, validateInvoice } = useInvoices();
  const toast = useToast();

  const [activeInvoice, setActiveInvoice] = useState<Invoice | null>(null);
  const [editedInvoice, setEditedInvoice] = useState<Invoice | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [reviewNote, setReviewNote] = useState('');
  
  // Dialog state
  const [showApproveDialog, setShowApproveDialog] = useState(false);
  const [showReviewDialog, setShowReviewDialog] = useState(false);

  // Unsaved-edit protection: server refreshes (polling, other actions) must never wipe what the user is typing.
  const dirtyRef = useRef(false);
  const baseToken = useRef<string | null>(null);
  const [serverChanged, setServerChanged] = useState(false);

  // Find invoice matching params or fallback
  useEffect(() => {
    if (invoices.length === 0) return;

    const found = invoices.find((inv) => inv.id === invoiceId) || invoices[0];
    setActiveInvoice(found);
    const token = `${found.id}:${found.version ?? found.lastUpdated}`;
    if (token === baseToken.current) return; // server copy unchanged
    const sameInvoice = baseToken.current?.startsWith(`${found.id}:`);
    if (dirtyRef.current && sameInvoice) {
      setServerChanged(true); // newer server data exists; keep the user's edits and tell them
      return;
    }
    baseToken.current = token;
    dirtyRef.current = false;
    setServerChanged(false);
    setEditedInvoice(JSON.parse(JSON.stringify(found)));
  }, [invoiceId, invoices]);

  const reloadFromServer = () => {
    const found = invoices.find((inv) => inv.id === invoiceId) || invoices[0];
    if (!found) return;
    baseToken.current = `${found.id}:${found.version ?? found.lastUpdated}`;
    dirtyRef.current = false;
    setServerChanged(false);
    setEditedInvoice(JSON.parse(JSON.stringify(found)));
  };

  if (!editedInvoice) {
    return (
      <div className="p-8 text-center bg-white rounded-lg border border-[#E3E8F0]">
        <p className="text-sm font-semibold text-[#172B4D]">Loading Invoice Extraction...</p>
      </div>
    );
  }

  const handleFieldChange = (updates: Partial<Invoice>) => {
    dirtyRef.current = true;
    setEditedInvoice((prev) => (prev ? { ...prev, ...updates, isManuallyEdited: true } : null));
  };

  const handleLineItemsChange = (items: LineItem[]) => {
    dirtyRef.current = true;
    setEditedInvoice((prev) => (prev ? { ...prev, lineItems: items, isManuallyEdited: true } : null));
  };

  const handleSaveChanges = async () => {
    if (!editedInvoice) return;
    setIsSaving(true);
    dirtyRef.current = false; // the server copy returned by the save should replace the local edit buffer
    try {
      await updateInvoiceData(editedInvoice.id, editedInvoice);
      toast.success('Changes Saved', 'Invoice fields and line items updated successfully.');
    } catch {
      dirtyRef.current = true; // keep edits; the exact server error was already shown by the data layer
      if (!IS_BACKEND) toast.error('Save Failed', 'Unable to persist changes.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRunValidation = async () => {
    if (!editedInvoice) return;
    if (IS_BACKEND) {
      // Server-side deterministic validation. Unsaved edits are saved first (a save re-validates).
      try {
        if (dirtyRef.current) {
          dirtyRef.current = false;
          await updateInvoiceData(editedInvoice.id, editedInvoice);
        } else {
          await validateInvoice(editedInvoice.id);
        }
        toast.success('Validation Complete', 'Results were saved. See the Validation Center for findings.');
      } catch {
        dirtyRef.current = true;
      }
      return;
    }
    const issues = ValidationService.validateInvoice(
      editedInvoice,
      settings.roundingTolerance,
      invoices
    );

    const hasCritical = issues.some((i) => i.severity === 'critical');
    const newStatus = issues.length === 0 ? 'valid' : hasCritical ? 'critical' : 'warning';

    setEditedInvoice((prev) => (prev ? { ...prev, validationStatus: newStatus } : null));
    updateInvoiceData(editedInvoice.id, { validationStatus: newStatus });

    if (issues.length === 0) {
      toast.success('Validation Passed', 'All mathematical and structural rules satisfied.');
    } else {
      toast.warning(
        `Validation Finished: ${issues.length} issue(s)`,
        `${issues.map((i) => i.ruleTitle).slice(0, 2).join(', ')}`
      );
    }
  };

  const handleSendToReview = async () => {
    if (!editedInvoice) return;
    try {
      await changeReviewStatus(
        editedInvoice.id,
        'in_review',
        'Finance Workspace',
        reviewNote || 'Moved to manual exception review from Extraction Studio.'
      );
    } catch {
      setShowReviewDialog(false);
      return; // error already shown; do not navigate as if it worked
    }
    toast.info('Sent to Review', `Invoice ${editedInvoice.invoiceNumber} assigned for review.`);
    setShowReviewDialog(false);
    navigate('/review');
  };

  const handleApproveAndExport = async () => {
    if (!editedInvoice) return;
    if (IS_BACKEND && dirtyRef.current) {
      toast.warning('Unsaved changes', 'Save your changes before approving so the approval matches what you exported.');
      setShowApproveDialog(false);
      return;
    }
    try {
      await changeReviewStatus(
        editedInvoice.id,
        'approved',
        'Finance Workspace',
        reviewNote || 'Approved via Extraction Studio.'
      );
    } catch {
      setShowApproveDialog(false);
      return;
    }
    
    // Export single invoice to CSV
    ExportService.exportInvoicesCSV([editedInvoice], `Approved_${editedInvoice.invoiceNumber}.csv`);
    
    toast.success('Invoice Approved & Exported', `Generated CSV export for ${editedInvoice.invoiceNumber}.`);
    setShowApproveDialog(false);
  };

  return (
    <div className="space-y-4">
      {/* Top Header / Switcher Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3.5 rounded-lg border border-[#E3E8F0]">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/documents')}
            className="p-1.5 text-[#697586] hover:text-[#172B4D] hover:bg-[#F2F6FF] rounded-md transition-colors"
            title="Back to Documents"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-[#172B4D]">
                {editedInvoice.invoiceNumber || 'Untitled Invoice'}
              </h1>
              <span className="text-xs text-[#697586]">({editedInvoice.vendorName})</span>
              <StatusBadge type="processing" status={editedInvoice.processingStatus} />
              <StatusBadge type="validation" status={editedInvoice.validationStatus} />
              <StatusBadge type="review" status={editedInvoice.reviewStatus} />
            </div>
            <p className="text-[11px] text-[#697586]">
              Source File: <span className="font-mono">{editedInvoice.fileName}</span>
            </p>
          </div>
        </div>

        {/* Quick Invoice Switcher Dropdown */}
        <div className="flex items-center gap-2">
          <div className="relative">
            <select
              value={editedInvoice.id}
              onChange={(e) => navigate(`/extraction/${e.target.value}`)}
              className="appearance-none bg-[#F8F9FA] border border-[#E3E8F0] text-xs font-medium text-[#172B4D] py-1.5 pl-3 pr-8 rounded-lg focus:outline-hidden cursor-pointer"
            >
              {invoices.map((inv) => (
                <option key={inv.id} value={inv.id}>
                  {inv.invoiceNumber || 'No #'} - {inv.vendorName.substring(0, 20)}
                </option>
              ))}
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-[#697586] absolute right-2.5 top-2.5 pointer-events-none" />
          </div>

          <button
            onClick={handleRunValidation}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#172B4D] bg-[#F7F9FC] border border-[#E3E8F0] hover:bg-[#E3E8F0] rounded-lg transition-colors"
          >
            <ShieldAlert className="w-3.5 h-3.5 text-[#356AE6]" />
            Validate
          </button>

          <button
            onClick={handleSaveChanges}
            disabled={isSaving}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#356AE6] hover:bg-[#2955BF] rounded-lg transition-colors shadow-xs disabled:opacity-60"
          >
            <Save className="w-3.5 h-3.5" />
            Save Changes
          </button>
        </div>
      </div>

      {/* Main Studio Two-Panel Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch min-h-[750px]">
        {/* Left Panel: Document Preview (5 cols) */}
        <div className="lg:col-span-5 h-[700px] lg:h-auto">
          <DocumentPreview invoice={editedInvoice} />
        </div>

        {/* Right Panel: Extracted Data & Line Items Form (7 cols) */}
        <div className="lg:col-span-7 flex flex-col justify-between space-y-4">
          <div className="space-y-4">
            {/* Extraction Confidence Header Card */}
            <div className="bg-white rounded-lg border border-[#E3E8F0] p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#EFF8FF] text-[#356AE6] flex items-center justify-center font-bold text-xs font-mono">
                  {IS_BACKEND ? Object.keys(editedInvoice.fieldWarnings ?? {}).length : `${editedInvoice.overallConfidence}%`}
                </div>
                <div>
                  <div className="text-xs font-semibold text-[#172B4D] flex items-center gap-1.5">
                    <span>{IS_BACKEND ? 'Fields Needing Verification' : 'Simulated Extraction Confidence'}</span>
                    <Sparkles className="w-3.5 h-3.5 text-[#356AE6]" />
                  </div>
                  <p className="text-[11px] text-[#697586]">
                    {IS_BACKEND
                      ? 'Flagged by deterministic checks (value not in PDF text, ambiguous format, unreadable). No AI confidence score is shown.'
                      : `Demo score indicating accuracy probability across ${editedInvoice.lineItems.length + 12} parsed entities.`}
                  </p>
                </div>
              </div>

              <div className="text-right">
                <span className="text-[11px] font-mono text-slate-500 bg-[#F8F9FA] px-2 py-1 rounded border border-[#E3E8F0]">
                  {IS_BACKEND ? 'Groq + PDF text layer' : 'OCR Layout v2.4 (Demo)'}
                </span>
              </div>
            </div>

            {IS_BACKEND && (editedInvoice.processingStatus === 'queued' || editedInvoice.processingStatus === 'processing') && (
              <div role="status" className="bg-[#EFF8FF] border border-[#B2DDFF] text-[#175CD3] text-xs rounded-lg px-4 py-2.5">
                Extraction is {editedInvoice.processingStatus}. Fields will appear automatically when it finishes; editing is disabled until then.
              </div>
            )}
            {IS_BACKEND && editedInvoice.processingStatus === 'failed' && (
              <div role="alert" className="bg-[#FEF3F2] border border-[#FECDCA] text-[#B42318] text-xs rounded-lg px-4 py-2.5">
                Extraction failed: {editedInvoice.errorMessage || 'unknown error'}. Use Retry in the Documents queue; the uploaded PDF is preserved.
              </div>
            )}
            {serverChanged && (
              <div role="alert" className="bg-[#FFFAEB] border border-[#FEDF89] text-[#93370D] text-xs rounded-lg px-4 py-2.5 flex items-center justify-between gap-3">
                <span>This invoice changed on the server while you were editing. Your unsaved edits are kept.</span>
                <button onClick={reloadFromServer} className="shrink-0 px-2.5 py-1 font-semibold bg-white border border-[#FEDF89] rounded-md">
                  Discard mine &amp; reload
                </button>
              </div>
            )}

            {/* Editable Fields Form + Line Items (natively disabled while the server is still extracting) */}
            <fieldset
              disabled={IS_BACKEND && (editedInvoice.processingStatus === 'queued' || editedInvoice.processingStatus === 'processing')}
              className="contents"
            >
              <InvoiceFieldsForm invoice={editedInvoice} onChange={handleFieldChange} />
              <LineItemsTable
                lineItems={editedInvoice.lineItems}
                currency={editedInvoice.currency}
                onChange={handleLineItemsChange}
              />
            </fieldset>
          </div>

          {/* Bottom Workflow Action Bar (as seen in image) */}
          <div className="bg-white rounded-lg border border-[#E3E8F0] p-4 flex flex-col sm:flex-row items-center justify-between gap-4 sticky bottom-2 shadow-md">
            <div className="w-full sm:w-auto flex-1 max-w-md">
              <input
                type="text"
                placeholder="Add an internal review note (optional)..."
                value={reviewNote}
                onChange={(e) => setReviewNote(e.target.value)}
                className="w-full px-3 py-1.5 text-xs bg-[#F8F9FA] border border-[#E3E8F0] focus:border-[#356AE6] rounded-lg focus:outline-hidden text-[#172B4D]"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              <button
                type="button"
                onClick={() => setShowReviewDialog(true)}
                className="px-3.5 py-2 text-xs font-medium text-[#172B4D] bg-[#F7F9FC] hover:bg-[#E3E8F0] border border-[#E3E8F0] rounded-lg transition-colors flex items-center gap-1.5"
              >
                <Send className="w-3.5 h-3.5 text-[#C98512]" />
                Send to Review
              </button>

              <button
                type="button"
                onClick={() => setShowApproveDialog(true)}
                className="px-4 py-2 text-xs font-semibold text-white bg-[#16865C] hover:bg-[#0E6243] rounded-lg transition-colors shadow-xs flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-4 h-4" />
                Approve & Export
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Confirmation Modals */}
      <ConfirmDialog
        isOpen={showApproveDialog}
        title="Approve Invoice & Generate Export"
        description={`Are you sure you want to approve invoice ${editedInvoice.invoiceNumber} for payment? This marks the review status as Approved and downloads a verified CSV register.`}
        confirmLabel="Approve & Export"
        variant="success"
        onConfirm={handleApproveAndExport}
        onCancel={() => setShowApproveDialog(false)}
      />

      <ConfirmDialog
        isOpen={showReviewDialog}
        title="Send Invoice to Review Queue"
        description={`Move invoice ${editedInvoice.invoiceNumber} to the Exception Review Queue for senior financial validation.`}
        confirmLabel="Confirm Assignment"
        variant="warning"
        onConfirm={handleSendToReview}
        onCancel={() => setShowReviewDialog(false)}
      />
    </div>
  );
};
