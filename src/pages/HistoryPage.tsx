import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  Filter,
  Download,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  FileSearch,
  ShieldAlert,
  ArrowUpDown,
  FileSpreadsheet,
} from 'lucide-react';
import { useInvoices } from '../context/InvoiceContext';
import { useToast } from '../context/ToastContext';
import { StatusBadge } from '../components/common/StatusBadge';
import { formatCurrency } from '../utils/currency';
import { formatDate, formatDateTime } from '../utils/dates';
import { ExportService } from '../services/exportService';

type SortField = 'invoiceNumber' | 'vendorName' | 'invoiceDate' | 'grandTotal' | 'reviewStatus';
type SortOrder = 'asc' | 'desc';

export const HistoryPage: React.FC = () => {
  const navigate = useNavigate();
  const { invoices } = useInvoices();
  const toast = useToast();

  // Search & Filters state
  const [search, setSearch] = useState('');
  const [processingFilter, setProcessingFilter] = useState('all');
  const [validationFilter, setValidationFilter] = useState('all');
  const [reviewFilter, setReviewFilter] = useState('all');
  const [currencyFilter, setCurrencyFilter] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Sorting state
  const [sortField, setSortField] = useState<SortField>('invoiceDate');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  const handleResetFilters = () => {
    setSearch('');
    setProcessingFilter('all');
    setValidationFilter('all');
    setReviewFilter('all');
    setCurrencyFilter('all');
    setStartDate('');
    setEndDate('');
    setCurrentPage(1);
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  // Filter & sort logic
  const filteredInvoices = useMemo(() => {
    return invoices
      .filter((inv) => {
        const matchesSearch =
          inv.invoiceNumber.toLowerCase().includes(search.toLowerCase()) ||
          inv.vendorName.toLowerCase().includes(search.toLowerCase()) ||
          inv.fileName.toLowerCase().includes(search.toLowerCase());

        const matchesProcessing =
          processingFilter === 'all' || inv.processingStatus === processingFilter;

        const matchesValidation =
          validationFilter === 'all' || inv.validationStatus === validationFilter;

        const matchesReview =
          reviewFilter === 'all' || inv.reviewStatus === reviewFilter;

        const matchesCurrency =
          currencyFilter === 'all' || inv.currency === currencyFilter;

        const matchesStartDate =
          !startDate || (inv.invoiceDate && inv.invoiceDate >= startDate);

        const matchesEndDate =
          !endDate || (inv.invoiceDate && inv.invoiceDate <= endDate);

        return (
          matchesSearch &&
          matchesProcessing &&
          matchesValidation &&
          matchesReview &&
          matchesCurrency &&
          matchesStartDate &&
          matchesEndDate
        );
      })
      .sort((a, b) => {
        let valA: any = a[sortField] || '';
        let valB: any = b[sortField] || '';

        if (sortField === 'grandTotal') {
          return sortOrder === 'asc' ? a.grandTotal - b.grandTotal : b.grandTotal - a.grandTotal;
        }

        if (typeof valA === 'string') {
          return sortOrder === 'asc'
            ? valA.localeCompare(valB)
            : valB.localeCompare(valA);
        }

        return 0;
      });
  }, [
    invoices,
    search,
    processingFilter,
    validationFilter,
    reviewFilter,
    currencyFilter,
    startDate,
    endDate,
    sortField,
    sortOrder,
  ]);

  const totalPages = Math.ceil(filteredInvoices.length / pageSize) || 1;
  const paginatedList = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredInvoices.slice(start, start + pageSize);
  }, [filteredInvoices, currentPage, pageSize]);

  const handleExportFilteredCSV = () => {
    ExportService.exportInvoicesCSV(filteredInvoices, 'INVOXIS_Filtered_Invoices.csv');
    toast.success('Export Downloaded', `Exported ${filteredInvoices.length} invoices to CSV.`);
  };

  return (
    <div className="space-y-6">
      {/* Page Title & Top Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[#172B4D] tracking-tight">Invoice History Register</h1>
          <p className="text-xs text-[#697586] mt-0.5">
            Complete audited accounts payable register with multi-dimensional filtering and CSV export
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExportFilteredCSV}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#356AE6] hover:bg-[#2955BF] rounded-lg transition-colors shadow-xs"
          >
            <Download className="w-3.5 h-3.5" />
            Export Filtered CSV ({filteredInvoices.length})
          </button>
        </div>
      </div>

      {/* Filter Toolbar Card */}
      <div className="bg-white rounded-lg border border-[#E3E8F0] p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Search */}
          <div className="flex items-center bg-[#F7F9FC] border border-[#E3E8F0] focus-within:border-[#356AE6] rounded-md px-2.5 py-1.5 text-xs">
            <Search className="w-3.5 h-3.5 text-[#697586] mr-2 shrink-0" />
            <input
              type="text"
              placeholder="Search invoice #, vendor, file..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full bg-transparent text-[#172B4D] placeholder-[#697586] focus:outline-hidden"
            />
          </div>

          {/* Date Range Start */}
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-[#697586] shrink-0 text-[11px]">From:</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full bg-[#F7F9FC] border border-[#E3E8F0] focus:border-[#356AE6] rounded-md px-2 py-1 text-xs text-[#172B4D] focus:outline-hidden"
            />
          </div>

          {/* Date Range End */}
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-[#697586] shrink-0 text-[11px]">To:</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full bg-[#F7F9FC] border border-[#E3E8F0] focus:border-[#356AE6] rounded-md px-2 py-1 text-xs text-[#172B4D] focus:outline-hidden"
            />
          </div>

          {/* Currency */}
          <div className="flex items-center bg-[#F7F9FC] border border-[#E3E8F0] rounded-md px-2 py-1 text-xs">
            <span className="text-[#697586] mr-2 text-[11px]">Currency:</span>
            <select
              value={currencyFilter}
              onChange={(e) => {
                setCurrencyFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full bg-transparent text-[#172B4D] focus:outline-hidden font-medium"
            >
              <option value="all">All Currencies</option>
              <option value="USD">USD ($)</option>
              <option value="EUR">EUR (€)</option>
              <option value="GBP">GBP (£)</option>
            </select>
          </div>
        </div>

        {/* Secondary Filter Row */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[#E3E8F0]">
          <div className="flex flex-wrap items-center gap-2">
            {/* Processing Filter */}
            <select
              value={processingFilter}
              onChange={(e) => {
                setProcessingFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="bg-[#F7F9FC] border border-[#E3E8F0] text-xs text-[#172B4D] rounded-md px-2 py-1 focus:outline-hidden"
            >
              <option value="all">All Processing</option>
              <option value="completed">Completed</option>
              <option value="needs_review">Needs Review</option>
              <option value="failed">Failed</option>
            </select>

            {/* Validation Filter */}
            <select
              value={validationFilter}
              onChange={(e) => {
                setValidationFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="bg-[#F7F9FC] border border-[#E3E8F0] text-xs text-[#172B4D] rounded-md px-2 py-1 focus:outline-hidden"
            >
              <option value="all">All Validations</option>
              <option value="valid">Valid (Passed)</option>
              <option value="warning">Warnings</option>
              <option value="critical">Critical Discrepancies</option>
            </select>

            {/* Review Filter */}
            <select
              value={reviewFilter}
              onChange={(e) => {
                setReviewFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="bg-[#F7F9FC] border border-[#E3E8F0] text-xs text-[#172B4D] rounded-md px-2 py-1 focus:outline-hidden"
            >
              <option value="all">All Reviews</option>
              <option value="approved">Approved</option>
              <option value="pending">Pending</option>
              <option value="in_review">In Review</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>

          <button
            onClick={handleResetFilters}
            className="flex items-center gap-1 text-xs text-[#697586] hover:text-[#172B4D] py-1 px-2 rounded hover:bg-[#F2F6FF]"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset Filters
          </button>
        </div>
      </div>

      {/* Invoice Register Table */}
      <div className="bg-white rounded-lg border border-[#E3E8F0] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-[#F8F9FA] text-[11px] font-semibold text-[#697586] uppercase tracking-wider border-b border-[#E3E8F0]">
                <th
                  onClick={() => handleSort('invoiceNumber')}
                  className="py-2.5 px-4 cursor-pointer hover:text-[#172B4D]"
                >
                  <div className="flex items-center gap-1">
                    Invoice #
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('vendorName')}
                  className="py-2.5 px-4 cursor-pointer hover:text-[#172B4D]"
                >
                  <div className="flex items-center gap-1">
                    Vendor
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('invoiceDate')}
                  className="py-2.5 px-4 cursor-pointer hover:text-[#172B4D]"
                >
                  <div className="flex items-center gap-1">
                    Date
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th className="py-2.5 px-4">Due Date</th>
                <th className="py-2.5 px-4">Curr</th>
                <th
                  onClick={() => handleSort('grandTotal')}
                  className="py-2.5 px-4 text-right cursor-pointer hover:text-[#172B4D]"
                >
                  <div className="flex items-center justify-end gap-1">
                    Grand Total
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th className="py-2.5 px-4">Processing</th>
                <th className="py-2.5 px-4">Validation</th>
                <th
                  onClick={() => handleSort('reviewStatus')}
                  className="py-2.5 px-4 cursor-pointer hover:text-[#172B4D]"
                >
                  <div className="flex items-center gap-1">
                    Review Status
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th className="py-2.5 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E3E8F0]">
              {paginatedList.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-[#697586]">
                    No invoices match the specified criteria. Try clearing some filters.
                  </td>
                </tr>
              ) : (
                paginatedList.map((inv) => (
                  <tr
                    key={inv.id}
                    onClick={() => navigate(`/extraction/${inv.id}`)}
                    className="hover:bg-[#F2F6FF]/50 transition-colors cursor-pointer group"
                  >
                    <td className="py-3 px-4 font-mono font-medium text-[#172B4D]">
                      {inv.invoiceNumber || <span className="text-slate-400 italic">—</span>}
                    </td>
                    <td className="py-3 px-4 font-medium text-[#172B4D] truncate max-w-[170px]">
                      {inv.vendorName || <span className="text-slate-400 italic">Unknown</span>}
                    </td>
                    <td className="py-3 px-4 text-[#697586] whitespace-nowrap">
                      {formatDate(inv.invoiceDate, 'MMM DD, YYYY')}
                    </td>
                    <td className="py-3 px-4 text-[#697586] whitespace-nowrap">
                      {formatDate(inv.dueDate, 'MMM DD, YYYY')}
                    </td>
                    <td className="py-3 px-4 font-mono text-[#697586]">{inv.currency}</td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-[#172B4D] tabular-nums whitespace-nowrap">
                      {formatCurrency(inv.grandTotal, inv.currency)}
                    </td>
                    <td className="py-3 px-4">
                      <StatusBadge type="processing" status={inv.processingStatus} />
                    </td>
                    <td className="py-3 px-4">
                      <StatusBadge type="validation" status={inv.validationStatus} />
                    </td>
                    <td className="py-3 px-4">
                      <StatusBadge type="review" status={inv.reviewStatus} />
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => navigate(`/extraction/${inv.id}`)}
                          className="p-1.5 text-[#356AE6] hover:bg-[#EFF8FF] rounded-md transition-colors"
                          title="Open Extraction Studio"
                        >
                          <FileSearch className="w-3.5 h-3.5" />
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
        <div className="p-3.5 border-t border-[#E3E8F0] bg-[#F8F9FA] flex items-center justify-between text-xs text-[#697586]">
          <span>
            Showing {paginatedList.length} of {filteredInvoices.length} invoices
          </span>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-1 rounded border border-[#E3E8F0] bg-white text-[#172B4D] disabled:opacity-40"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span className="font-mono tabular-nums">
              {currentPage} / {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="p-1 rounded border border-[#E3E8F0] bg-white text-[#172B4D] disabled:opacity-40"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
