import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ClipboardCheck,
  CheckCircle2,
  XCircle,
  RotateCcw,
  MessageSquare,
  Search,
  Filter,
  FileSearch,
  History,
  AlertTriangle,
  Download,
} from 'lucide-react';
import { useInvoices } from '../context/InvoiceContext';
import { useToast } from '../context/ToastContext';
import { StatusBadge } from '../components/common/StatusBadge';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { formatCurrency } from '../utils/currency';
import { formatDateTime } from '../utils/dates';
import { ExportService } from '../services/exportService';
import { Invoice, ReviewStatus } from '../types/invoice';

export const ReviewPage: React.FC = () => {
  const navigate = useNavigate();
  const { invoices, validationIssues, changeReviewStatus } = useInvoices();
  const toast = useToast();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('actionable'); // actionable = pending | in_review
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);

  // Dialog states
  const [confirmAction, setConfirmAction] = useState<{
    invoice: Invoice;
    targetStatus: ReviewStatus;
    title: string;
    description: string;
    variant: 'success' | 'danger' | 'warning';
  } | null>(null);

  const [noteDialogInvoice, setNoteDialogInvoice] = useState<Invoice | null>(null);
  const [noteText, setNoteText] = useState('');

  const [viewHistoryInvoice, setViewHistoryInvoice] = useState<Invoice | null>(null);

  // Filtered invoices for review queue
  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      const matchesSearch =
        inv.invoiceNumber.toLowerCase().includes(search.toLowerCase()) ||
        inv.vendorName.toLowerCase().includes(search.toLowerCase());

      let matchesStatus = true;
      if (statusFilter === 'actionable') {
        matchesStatus = inv.reviewStatus === 'pending' || inv.reviewStatus === 'in_review';
      } else if (statusFilter !== 'all') {
        matchesStatus = inv.reviewStatus === statusFilter;
      }

      return matchesSearch && matchesStatus;
    });
  }, [invoices, search, statusFilter]);

  const handleConfirmDecision = async () => {
    if (!confirmAction) return;
    const { invoice, targetStatus } = confirmAction;

    try {
      await changeReviewStatus(
        invoice.id,
        targetStatus,
        'Lead Financial Analyst',
        noteText || `Decision changed to ${targetStatus} via Review Queue.`
      );
    } catch {
      setConfirmAction(null); // exact server error already shown (e.g. invalid transition); no false success
      return;
    }

    const actionMessage =
      targetStatus === 'approved'
        ? `Invoice ${invoice.invoiceNumber} approved.`
        : targetStatus === 'rejected'
        ? `Invoice ${invoice.invoiceNumber} rejected.`
        : `Invoice ${invoice.invoiceNumber} returned for vendor correction.`;

    toast.success('Status Updated', actionMessage);
    setConfirmAction(null);
    setNoteText('');
  };

  const handleAddNote = async () => {
    if (!noteDialogInvoice || !noteText.trim()) return;

    try {
      await changeReviewStatus(
        noteDialogInvoice.id,
        noteDialogInvoice.reviewStatus,
        'Lead Financial Analyst',
        noteText
      );
    } catch {
      return;
    }

    toast.success('Note Logged', 'Internal review note added to invoice history.');
    setNoteDialogInvoice(null);
    setNoteText('');
  };

  const handleExportReviewQueue = () => {
    ExportService.exportReviewQueueCSV(invoices);
    toast.success('Export Ready', 'Downloaded review queue items to CSV.');
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[#172B4D] tracking-tight">
            Review Queue & Exceptions
          </h1>
          <p className="text-xs text-[#697586] mt-0.5">
            Human-in-the-loop exception handling, sign-offs, and compliance clearance
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExportReviewQueue}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#172B4D] bg-white border border-[#E3E8F0] hover:bg-[#F7F9FC] rounded-lg transition-colors shadow-xs"
          >
            <Download className="w-3.5 h-3.5 text-[#356AE6]" />
            Export Queue CSV
          </button>
        </div>
      </div>

      {/* Review Queue Table Container */}
      <div className="bg-white rounded-lg border border-[#E3E8F0] overflow-hidden">
        {/* Table Filter Bar */}
        <div className="p-4 border-b border-[#E3E8F0] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-[#172B4D]">Invoices Requiring Attention</h3>
            <p className="text-xs text-[#697586]">
              {filteredInvoices.length} invoices waiting for approval or correction
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Search */}
            <div className="flex items-center bg-[#F7F9FC] border border-[#E3E8F0] focus-within:border-[#356AE6] rounded-md px-2.5 py-1.5 text-xs w-48">
              <Search className="w-3.5 h-3.5 text-[#697586] mr-1.5 shrink-0" />
              <input
                type="text"
                placeholder="Search queue..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-transparent text-[#172B4D] placeholder-[#697586] focus:outline-hidden"
              />
            </div>

            {/* Filter */}
            <div className="flex items-center bg-[#F7F9FC] border border-[#E3E8F0] rounded-md px-2 py-1.5 text-xs text-[#172B4D]">
              <Filter className="w-3.5 h-3.5 text-[#697586] mr-1.5" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-transparent focus:outline-hidden text-xs font-medium"
              >
                <option value="actionable">Actionable (Pending/In Review)</option>
                <option value="pending">Pending Only</option>
                <option value="in_review">In Review Only</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
                <option value="all">All Invoices</option>
              </select>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-[#F8F9FA] text-[11px] font-semibold text-[#697586] uppercase tracking-wider border-b border-[#E3E8F0]">
                <th className="py-2.5 px-4">Invoice #</th>
                <th className="py-2.5 px-4">Vendor</th>
                <th className="py-2.5 px-4 text-right">Invoice Total</th>
                <th className="py-2.5 px-4">Discrepancies</th>
                <th className="py-2.5 px-4">Reason for Review</th>
                <th className="py-2.5 px-4">Review Status</th>
                <th className="py-2.5 px-4">Reviewer</th>
                <th className="py-2.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E3E8F0]">
              {filteredInvoices.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-[#697586]">
                    <CheckCircle2 className="w-7 h-7 text-[#16865C] mx-auto mb-2" />
                    <p className="font-semibold text-sm text-[#172B4D]">Review Queue Clear</p>
                    <p className="text-xs text-[#697586] mt-0.5">
                      No invoices currently requiring manual financial intervention under this filter.
                    </p>
                  </td>
                </tr>
              ) : (
                filteredInvoices.map((inv) => {
                  const issuesForInv = validationIssues.filter((i) => i.invoiceId === inv.id);
                  const criticalCount = issuesForInv.filter((i) => i.severity === 'critical').length;

                  return (
                    <tr key={inv.id} className="hover:bg-[#F2F6FF]/40 transition-colors">
                      <td className="py-3 px-4 font-mono font-medium text-[#172B4D]">
                        {inv.invoiceNumber || <span className="text-slate-400 italic">Unassigned</span>}
                      </td>
                      <td className="py-3 px-4 font-medium text-[#172B4D] truncate max-w-[150px]">
                        {inv.vendorName || <span className="text-slate-400 italic">Unknown</span>}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-[#172B4D] tabular-nums whitespace-nowrap">
                        {formatCurrency(inv.grandTotal, inv.currency)}
                      </td>
                      <td className="py-3 px-4">
                        {issuesForInv.length > 0 ? (
                          <span
                            className={`inline-flex items-center gap-1 font-mono text-[11px] font-semibold px-2 py-0.5 rounded ${
                              criticalCount > 0
                                ? 'bg-[#FEF3F2] text-[#D64545]'
                                : 'bg-[#FFFAEB] text-[#C98512]'
                            }`}
                          >
                            <AlertTriangle className="w-3 h-3" />
                            {issuesForInv.length} {criticalCount > 0 ? 'Critical' : 'Warning'}
                          </span>
                        ) : (
                          <span className="text-[#16865C] font-medium text-[11px] flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" />
                            None
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 min-w-[200px] max-w-xs truncate text-[#697586]">
                        {issuesForInv[0]?.ruleTitle || 'Standard approval routing'}
                      </td>
                      <td className="py-3 px-4">
                        <StatusBadge type="review" status={inv.reviewStatus} />
                      </td>
                      <td className="py-3 px-4 text-[#697586] truncate max-w-[120px]">
                        {inv.assignedReviewer || <span className="text-slate-400 italic">Unassigned</span>}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Inspect in Extraction */}
                          <button
                            onClick={() => navigate(`/extraction/${inv.id}`)}
                            className="p-1.5 text-[#356AE6] hover:bg-[#EFF8FF] rounded-md transition-colors"
                            title="Inspect in Extraction Studio"
                          >
                            <FileSearch className="w-3.5 h-3.5" />
                          </button>

                          {/* Add Note */}
                          <button
                            onClick={() => {
                              setNoteDialogInvoice(inv);
                              setNoteText('');
                            }}
                            className="p-1.5 text-[#697586] hover:text-[#172B4D] hover:bg-[#F2F6FF] rounded-md transition-colors"
                            title="Add Review Note"
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                          </button>

                          {/* View History */}
                          <button
                            onClick={() => setViewHistoryInvoice(inv)}
                            className="p-1.5 text-[#697586] hover:text-[#172B4D] hover:bg-[#F2F6FF] rounded-md transition-colors"
                            title="View Audit & Review Trail"
                          >
                            <History className="w-3.5 h-3.5" />
                          </button>

                          {/* Approve Action */}
                          {inv.reviewStatus !== 'approved' && (
                            <button
                              onClick={() =>
                                setConfirmAction({
                                  invoice: inv,
                                  targetStatus: 'approved',
                                  title: 'Approve Invoice for Payment',
                                  description: `Are you sure you want to approve invoice ${inv.invoiceNumber} for ${formatCurrency(
                                    inv.grandTotal,
                                    inv.currency
                                  )}? This clears all audit holds.`,
                                  variant: 'success',
                                })
                              }
                              className="px-2 py-1 text-xs font-semibold text-white bg-[#16865C] hover:bg-[#0E6243] rounded-md transition-colors"
                            >
                              Approve
                            </button>
                          )}

                          {/* Reject Action */}
                          {inv.reviewStatus !== 'rejected' && (
                            <button
                              onClick={() =>
                                setConfirmAction({
                                  invoice: inv,
                                  targetStatus: 'rejected',
                                  title: 'Reject Invoice',
                                  description: `Reject invoice ${inv.invoiceNumber} from accounts payable settlement.`,
                                  variant: 'danger',
                                })
                              }
                              className="px-2 py-1 text-xs font-medium text-[#D64545] bg-[#FEF3F2] hover:bg-[#FECDCA] rounded-md transition-colors"
                            >
                              Reject
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Confirmation Dialog for Approvals / Rejections */}
      {confirmAction && (
        <ConfirmDialog
          isOpen={Boolean(confirmAction)}
          title={confirmAction.title}
          description={confirmAction.description}
          confirmLabel={confirmAction.targetStatus === 'approved' ? 'Approve Invoice' : 'Reject Invoice'}
          variant={confirmAction.variant}
          onConfirm={handleConfirmDecision}
          onCancel={() => setConfirmAction(null)}
        >
          <div className="mt-3">
            <label className="text-xs font-medium text-[#697586] block mb-1">
              Add optional decision comment:
            </label>
            <input
              type="text"
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="e.g. Cleared by controller for month-end batch..."
              className="w-full px-2.5 py-1.5 text-xs bg-[#F8F9FA] border border-[#E3E8F0] focus:border-[#356AE6] rounded text-[#172B4D] focus:outline-hidden"
            />
          </div>
        </ConfirmDialog>
      )}

      {/* Add Review Note Dialog */}
      {noteDialogInvoice && (
        <ConfirmDialog
          isOpen={Boolean(noteDialogInvoice)}
          title={`Add Review Note: ${noteDialogInvoice.invoiceNumber}`}
          description="Log an internal memo or question for compliance tracking."
          confirmLabel="Save Note"
          variant="primary"
          onConfirm={handleAddNote}
          onCancel={() => setNoteDialogInvoice(null)}
        >
          <div className="mt-3">
            <textarea
              rows={3}
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="Type internal review notes here..."
              className="w-full px-3 py-2 text-xs bg-[#F8F9FA] border border-[#E3E8F0] focus:border-[#356AE6] rounded-lg text-[#172B4D] focus:outline-hidden"
            />
          </div>
        </ConfirmDialog>
      )}

      {/* View Review History Drawer Modal */}
      {viewHistoryInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="bg-white rounded-xl shadow-xl border border-[#E3E8F0] max-w-lg w-full p-6 animate-in fade-in duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-[#E3E8F0]">
              <div>
                <h3 className="text-sm font-semibold text-[#172B4D]">
                  Review History: {viewHistoryInvoice.invoiceNumber}
                </h3>
                <p className="text-xs text-[#697586]">{viewHistoryInvoice.vendorName}</p>
              </div>
              <button
                onClick={() => setViewHistoryInvoice(null)}
                className="text-xs text-[#697586] hover:text-[#172B4D] font-medium"
              >
                Close
              </button>
            </div>

            <div className="mt-4 space-y-3 max-h-80 overflow-y-auto">
              {viewHistoryInvoice.reviewHistory.length === 0 ? (
                <div className="text-center py-6 text-xs text-[#697586]">
                  No prior review decisions logged for this invoice.
                </div>
              ) : (
                viewHistoryInvoice.reviewHistory.map((rec) => (
                  <div key={rec.id} className="p-3 rounded-lg bg-[#F8F9FA] border border-[#E3E8F0] text-xs">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-[#172B4D]">{rec.actor}</span>
                      <span className="font-mono text-[10px] text-[#697586]">
                        {formatDateTime(rec.timestamp)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-[11px] text-slate-500 uppercase">Action:</span>
                      <StatusBadge type="review" status={rec.newStatus} />
                    </div>
                    <p className="text-[#172B4D] text-[11px] italic bg-white p-2 rounded border border-[#E3E8F0]">
                      "{rec.comment || 'Status transition logged'}"
                    </p>
                  </div>
                ))
              )}
            </div>

            <div className="mt-5 pt-3 border-t border-[#E3E8F0] flex justify-end">
              <button
                onClick={() => setViewHistoryInvoice(null)}
                className="px-4 py-1.5 text-xs font-medium text-[#172B4D] bg-[#F7F9FC] border border-[#E3E8F0] rounded-lg hover:bg-[#E3E8F0]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
