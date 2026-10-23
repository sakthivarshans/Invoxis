import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  Filter,
  FileSearch,
  Trash2,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  FileText,
} from 'lucide-react';
import { useInvoices } from '../../context/InvoiceContext';
import { StatusBadge } from '../common/StatusBadge';
import { formatFileSize, formatCurrency } from '../../utils/currency';
import { formatDateTime } from '../../utils/dates';
import { useToast } from '../../context/ToastContext';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { ProcessingStatus } from '../../types/invoice';
import { IS_BACKEND } from '../../config';

export const DocumentQueueTable: React.FC = () => {
  const navigate = useNavigate();
  const { invoices, removeInvoice, updateInvoiceData, retryProcessing } = useInvoices();
  const toast = useToast();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 8;

  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Filtered & searched invoices
  const filteredList = useMemo(() => {
    return invoices.filter((inv) => {
      const matchesSearch =
        inv.fileName.toLowerCase().includes(search.toLowerCase()) ||
        inv.invoiceNumber.toLowerCase().includes(search.toLowerCase()) ||
        inv.vendorName.toLowerCase().includes(search.toLowerCase());

      const matchesStatus =
        statusFilter === 'all' || inv.processingStatus === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [invoices, search, statusFilter]);

  // Pagination calculation
  const totalPages = Math.ceil(filteredList.length / pageSize) || 1;
  const paginatedList = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredList.slice(start, start + pageSize);
  }, [filteredList, currentPage, pageSize]);

  const handleRetryJob = async (invId: string) => {
    if (IS_BACKEND) {
      try {
        await retryProcessing(invId);
        toast.info('Retry queued', 'Extraction restarted for the stored PDF. Status updates automatically.');
      } catch {
        /* exact server error (e.g. Groq not configured) was already shown */
      }
      return;
    }
    toast.info('Retrying OCR Job', 'Simulating OCR re-processing pipeline with high-resolution filter...');
    await new Promise((r) => setTimeout(r, 1000));
    
    await updateInvoiceData(invId, {
      processingStatus: 'completed',
      validationStatus: 'warning',
      errorMessage: undefined,
      invoiceNumber: 'INV-10492-R',
      vendorName: 'Apex Precision Transcribe',
      subtotal: 4200.00,
      taxAmount: 357.00,
      grandTotal: 4557.00,
      overallConfidence: 91.5,
      lineItems: [
        {
          id: 'li-recovered-1',
          description: 'Recovered Document Intake Scan Item',
          quantity: 1,
          unitPrice: 4200.00,
          discount: 0,
          taxRate: 8.5,
          lineTotal: 4200.00,
        },
      ],
    });
    toast.success('Extraction Succeeded', 'Invoice was successfully transcribed into the register.');
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    try {
      await removeInvoice(deleteId);
      toast.success(
        IS_BACKEND ? 'Document Archived' : 'Document Removed',
        IS_BACKEND ? 'Invoice archived. Audit and review history are retained.' : 'Invoice removed from document queue.'
      );
    } catch {
      /* error already shown */
    }
    setDeleteId(null);
  };

  return (
    <div className="bg-white rounded-lg border border-[#E3E8F0] overflow-hidden">
      {/* Table Header Controls */}
      <div className="p-4 border-b border-[#E3E8F0] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-[#172B4D]">Document Ingestion Queue</h3>
          <p className="text-xs text-[#697586]">
            Showing {filteredList.length} total document job records
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Search */}
          <div className="flex items-center bg-[#F7F9FC] border border-[#E3E8F0] focus-within:border-[#356AE6] rounded-md px-2.5 py-1.5 text-xs w-48">
            <Search className="w-3.5 h-3.5 text-[#697586] mr-1.5 shrink-0" />
            <input
              type="text"
              placeholder="Search documents..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full bg-transparent text-[#172B4D] placeholder-[#697586] focus:outline-hidden"
            />
          </div>

          {/* Filter Status */}
          <div className="flex items-center bg-[#F7F9FC] border border-[#E3E8F0] rounded-md px-2 py-1.5 text-xs text-[#172B4D]">
            <Filter className="w-3.5 h-3.5 text-[#697586] mr-1.5" />
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="bg-transparent focus:outline-hidden text-xs font-medium"
            >
              <option value="all">All Statuses</option>
              <option value="queued">Queued</option>
              <option value="processing">Processing</option>
              <option value="completed">Completed</option>
              <option value="needs_review">Needs Review</option>
              <option value="failed">Failed</option>
            </select>
          </div>
        </div>
      </div>

      {/* Table Body */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-[#F8F9FA] text-[11px] font-semibold text-[#697586] uppercase tracking-wider border-b border-[#E3E8F0]">
              <th className="py-2.5 px-4">Document / File</th>
              <th className="py-2.5 px-4">Invoice #</th>
              <th className="py-2.5 px-4">Upload Date</th>
              <th className="py-2.5 px-4">File Size</th>
              <th className="py-2.5 px-4">Processing Status</th>
              <th className="py-2.5 px-4">Validation Status</th>
              <th className="py-2.5 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E3E8F0] text-xs">
            {paginatedList.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-[#697586]">
                  No documents found matching the filter criteria.
                </td>
              </tr>
            ) : (
              paginatedList.map((inv) => (
                <tr key={inv.id} className="hover:bg-[#F2F6FF]/50 transition-colors">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-[#356AE6] shrink-0" />
                      <div className="min-w-0">
                        <p className="font-semibold text-[#172B4D] truncate max-w-[200px]">
                          {inv.fileName}
                        </p>
                        {inv.errorMessage && (
                          <p className="text-[11px] text-[#D64545] flex items-center gap-1 mt-0.5">
                            <AlertCircle className="w-3 h-3 shrink-0" />
                            <span className="truncate max-w-[240px]">{inv.errorMessage}</span>
                          </p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-4 font-mono font-medium text-[#172B4D]">
                    {inv.invoiceNumber || <span className="text-slate-400 italic">—</span>}
                  </td>
                  <td className="py-3 px-4 text-[#697586] whitespace-nowrap">
                    {formatDateTime(inv.uploadDate)}
                  </td>
                  <td className="py-3 px-4 font-mono text-[#697586] tabular-nums">
                    {formatFileSize(inv.fileSize)}
                  </td>
                  <td className="py-3 px-4">
                    <StatusBadge type="processing" status={inv.processingStatus} />
                  </td>
                  <td className="py-3 px-4">
                    <StatusBadge type="validation" status={inv.validationStatus} />
                  </td>
                  <td className="py-3 px-4 text-right whitespace-nowrap">
                    <div className="flex items-center justify-end gap-1.5">
                      {inv.processingStatus === 'failed' ? (
                        <button
                          onClick={() => handleRetryJob(inv.id)}
                          className="px-2 py-1 text-xs font-medium text-[#356AE6] bg-[#EFF8FF] hover:bg-[#D9E8FF] rounded-md transition-colors flex items-center gap-1"
                          title="Retry Optical Recognition Pipeline"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          Retry
                        </button>
                      ) : (
                        <button
                          onClick={() => navigate(`/extraction/${inv.id}`)}
                          className="px-2 py-1 text-xs font-medium text-[#172B4D] bg-[#F7F9FC] hover:bg-[#E3E8F0] border border-[#E3E8F0] rounded-md transition-colors flex items-center gap-1"
                          title="Open in Extraction Studio"
                        >
                          <FileSearch className="w-3.5 h-3.5 text-[#356AE6]" />
                          Inspect
                        </button>
                      )}

                      <button
                        onClick={() => setDeleteId(inv.id)}
                        className="p-1.5 text-[#697586] hover:text-[#D64545] hover:bg-[#FEF3F2] rounded-md transition-colors"
                        title="Delete Document"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Bar */}
      <div className="p-3 border-t border-[#E3E8F0] bg-[#F8F9FA] flex items-center justify-between text-xs text-[#697586]">
        <span>
          Page {currentPage} of {totalPages}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="p-1 rounded border border-[#E3E8F0] bg-white text-[#172B4D] disabled:opacity-40"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            className="p-1 rounded border border-[#E3E8F0] bg-white text-[#172B4D] disabled:opacity-40"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={Boolean(deleteId)}
        title="Remove Document from Queue"
        description="Are you sure you want to delete this invoice record from the intake queue? This action cannot be undone."
        confirmLabel="Delete Invoice"
        variant="danger"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
};
