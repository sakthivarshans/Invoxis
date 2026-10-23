import React, { useState, useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
} from 'recharts';
import {
  Download,
  FileSpreadsheet,
  FileText,
  AlertTriangle,
  ClipboardList,
  CheckCircle2,
  Calendar,
  Layers,
  ArrowRight,
} from 'lucide-react';
import { useInvoices } from '../context/InvoiceContext';
import { useToast } from '../context/ToastContext';
import { ExportService } from '../services/exportService';
import { formatCurrency } from '../utils/currency';
import { formatDate } from '../utils/dates';

export const ReportsPage: React.FC = () => {
  const { invoices, validationIssues, validationStats } = useInvoices();
  const toast = useToast();

  const [dateFilter, setDateFilter] = useState('all');

  // Compute vendor volume ranking
  const vendorData = useMemo(() => {
    const map: Record<string, { vendor: string; total: number; count: number }> = {};
    invoices.forEach((inv) => {
      const v = inv.vendorName || 'Unknown Vendor';
      if (!map[v]) {
        map[v] = { vendor: v, total: 0, count: 0 };
      }
      map[v].total += inv.grandTotal;
      map[v].count += 1;
    });

    return Object.values(map)
      .sort((a, b) => b.total - a.total)
      .slice(0, 7)
      .map((item) => ({
        ...item,
        displayVendor: item.vendor.length > 18 ? item.vendor.substring(0, 16) + '...' : item.vendor,
      }));
  }, [invoices]);

  // Status breakdown data
  const statusData = useMemo(() => {
    const approved = invoices.filter((i) => i.reviewStatus === 'approved').length;
    const pending = invoices.filter((i) => i.reviewStatus === 'pending' || i.reviewStatus === 'in_review').length;
    const rejected = invoices.filter((i) => i.reviewStatus === 'rejected').length;
    const failed = invoices.filter((i) => i.processingStatus === 'failed').length;

    return [
      { name: 'Approved', value: approved, color: '#16865C' },
      { name: 'In Review / Pending', value: pending, color: '#C98512' },
      { name: 'Rejected / Returned', value: rejected, color: '#697586' },
      { name: 'OCR Ingestion Failed', value: failed, color: '#D64545' },
    ].filter((d) => d.value > 0);
  }, [invoices]);

  // Duplicate candidates
  const duplicateCandidates = useMemo(() => {
    return invoices.filter((i) => i.isDuplicateCandidate);
  }, [invoices]);

  // Manually edited invoices
  const manuallyEditedCount = invoices.filter((i) => i.isManuallyEdited).length;

  // Total invoice value
  const totalValue = invoices.reduce((acc, i) => acc + i.grandTotal, 0);

  // Export handlers
  const handleExportExcel = () => {
    ExportService.exportFullExcelWorkbook(invoices, validationIssues);
    toast.success('Excel Generated', 'Full workbook with Invoices, Items, and Issues sheets downloaded.');
  };

  const handleExportInvoicesCSV = () => {
    ExportService.exportInvoicesCSV(invoices);
    toast.success('Invoices CSV Exported', 'Downloaded invoice register.');
  };

  const handleExportLineItemsCSV = () => {
    ExportService.exportLineItemsCSV(invoices);
    toast.success('Line Items CSV Exported', 'Downloaded itemized breakdown.');
  };

  const handleExportValidationCSV = () => {
    ExportService.exportValidationIssuesCSV(validationIssues);
    toast.success('Validation CSV Exported', 'Downloaded discrepancies log.');
  };

  const handleDownloadAuditReport = () => {
    ExportService.downloadValidationReport(invoices, validationIssues);
    toast.success('Validation Report Generated', 'Downloaded structured compliance text report.');
  };

  return (
    <div className="space-y-6">
      {/* Header & Main Export Package CTA */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[#172B4D] tracking-tight">
            Financial Reports & Export Center
          </h1>
          <p className="text-xs text-[#697586] mt-0.5">
            Operational spend analytics, vendor breakdown, validation discrepancies, and multi-format exports
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExportExcel}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#16865C] hover:bg-[#0E6243] rounded-lg transition-colors shadow-xs"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            Download Excel Workbook (.xlsx)
          </button>
        </div>
      </div>

      {/* Export Action Strip */}
      <div className="bg-white rounded-lg border border-[#E3E8F0] p-4">
        <div className="text-xs font-semibold text-[#172B4D] mb-3 flex items-center justify-between">
          <span>Direct Dataset Export Downloads</span>
          <span className="text-[11px] font-normal text-[#697586]">
            All exports include current frontend state & manual edits
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <button
            onClick={handleExportInvoicesCSV}
            className="p-3 bg-[#F8F9FA] hover:bg-[#EFF8FF] border border-[#E3E8F0] hover:border-[#356AE6] rounded-lg text-left transition-all group"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#172B4D] group-hover:text-[#356AE6]">
                Invoice Register CSV
              </span>
              <Download className="w-3.5 h-3.5 text-[#697586]" />
            </div>
            <p className="text-[11px] text-[#697586] mt-1">
              {invoices.length} headers, dates, totals, and statuses
            </p>
          </button>

          <button
            onClick={handleExportLineItemsCSV}
            className="p-3 bg-[#F8F9FA] hover:bg-[#EFF8FF] border border-[#E3E8F0] hover:border-[#356AE6] rounded-lg text-left transition-all group"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#172B4D] group-hover:text-[#356AE6]">
                Itemized Line Items CSV
              </span>
              <Download className="w-3.5 h-3.5 text-[#697586]" />
            </div>
            <p className="text-[11px] text-[#697586] mt-1">
              Granular quantities, unit prices, discounts, and taxes
            </p>
          </button>

          <button
            onClick={handleExportValidationCSV}
            className="p-3 bg-[#F8F9FA] hover:bg-[#EFF8FF] border border-[#E3E8F0] hover:border-[#356AE6] rounded-lg text-left transition-all group"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#172B4D] group-hover:text-[#356AE6]">
                Discrepancies Log CSV
              </span>
              <Download className="w-3.5 h-3.5 text-[#697586]" />
            </div>
            <p className="text-[11px] text-[#697586] mt-1">
              {validationIssues.length} rule flags and recommended remediation
            </p>
          </button>

          <button
            onClick={handleDownloadAuditReport}
            className="p-3 bg-[#F8F9FA] hover:bg-[#EFF8FF] border border-[#E3E8F0] hover:border-[#356AE6] rounded-lg text-left transition-all group"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#172B4D] group-hover:text-[#356AE6]">
                Validation Audit Summary (.txt)
              </span>
              <FileText className="w-3.5 h-3.5 text-[#697586]" />
            </div>
            <p className="text-[11px] text-[#697586] mt-1">
              Executive compliance text report with full discrepancy details
            </p>
          </button>
        </div>
      </div>

      {/* Analytics Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Chart 1: Spend Volume by Vendor */}
        <div className="bg-white p-5 rounded-lg border border-[#E3E8F0]">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-[#172B4D]">Top Vendor Spend Allocation</h3>
              <p className="text-xs text-[#697586]">Aggregated invoice volume by supplier</p>
            </div>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={vendorData} layout="vertical" margin={{ top: 5, right: 30, left: 30, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E3E8F0" />
                <XAxis
                  type="number"
                  tickFormatter={(val) => `$${(val / 1000).toFixed(0)}k`}
                  tickLine={false}
                  tick={{ fontSize: 10, fill: '#697586' }}
                />
                <YAxis
                  type="category"
                  dataKey="displayVendor"
                  tickLine={false}
                  axisLine={{ stroke: '#E3E8F0' }}
                  tick={{ fontSize: 11, fill: '#172B4D' }}
                  width={110}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const item = payload[0].payload;
                      return (
                        <div className="bg-[#172B4D] text-white p-2.5 rounded shadow text-xs">
                          <p className="font-semibold">{item.vendor}</p>
                          <p className="text-slate-300 font-mono mt-0.5">
                            Total: {formatCurrency(item.total, 'USD')} ({item.count} invoices)
                          </p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar dataKey="total" fill="#356AE6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 2: Processing & Clearance Success Rates */}
        <div className="bg-white p-5 rounded-lg border border-[#E3E8F0]">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-[#172B4D]">Workflow Clearance Distribution</h3>
              <p className="text-xs text-[#697586]">Approvals versus audit holds</p>
            </div>
          </div>

          <div className="h-64 w-full flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={statusData}
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {statusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const item = payload[0].payload;
                      return (
                        <div className="bg-[#172B4D] text-white p-2 rounded text-xs font-sans">
                          {item.name}: <span className="font-mono font-bold">{item.value}</span>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[#E3E8F0] text-xs">
            {statusData.map((item) => (
              <div key={item.name} className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                  <span className="text-[#697586] truncate">{item.name}</span>
                </div>
                <span className="font-mono font-semibold text-[#172B4D] tabular-nums">{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Detailed Operations Report Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Duplicate Candidates Report */}
        <div className="bg-white rounded-lg border border-[#E3E8F0] p-5">
          <div className="flex items-center justify-between pb-3 border-b border-[#E3E8F0] mb-3">
            <div>
              <h3 className="text-sm font-semibold text-[#172B4D]">Duplicate Candidate Warnings</h3>
              <p className="text-xs text-[#697586]">Potential double billing or repeated submission risks</p>
            </div>
            <span className="text-[11px] font-mono bg-[#FEF3F2] text-[#D64545] font-semibold px-2 py-0.5 rounded">
              {duplicateCandidates.length} Detected
            </span>
          </div>

          {duplicateCandidates.length === 0 ? (
            <p className="text-xs text-[#697586] py-6 text-center">
              No potential duplicate invoice candidates detected in active ledger.
            </p>
          ) : (
            <div className="space-y-3">
              {duplicateCandidates.map((inv) => (
                <div key={inv.id} className="p-3 rounded-lg bg-[#FEF3F2]/50 border border-[#FECDCA] text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-[#D64545]">{inv.invoiceNumber}</span>
                    <span className="font-mono font-semibold text-[#172B4D]">
                      {formatCurrency(inv.grandTotal, inv.currency)}
                    </span>
                  </div>
                  <p className="text-[#172B4D] font-medium mt-1">{inv.vendorName}</p>
                  <p className="text-[11px] text-[#697586] mt-0.5">
                    Duplicate risk matched against existing approved record #{inv.duplicateOfId || 'AT-90342'}.
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Extraction & Manual Correction Summary */}
        <div className="bg-white rounded-lg border border-[#E3E8F0] p-5">
          <div className="flex items-center justify-between pb-3 border-b border-[#E3E8F0] mb-3">
            <div>
              <h3 className="text-sm font-semibold text-[#172B4D]">Extraction & Human Review Metrics</h3>
              <p className="text-xs text-[#697586]">Manual field adjustment & review throughput</p>
            </div>
          </div>

          <div className="space-y-4 text-xs">
            <div className="flex items-center justify-between p-2.5 rounded bg-[#F8F9FA] border border-[#E3E8F0]">
              <span className="text-[#697586]">Manually Corrected Documents:</span>
              <span className="font-mono font-bold text-[#172B4D]">{manuallyEditedCount} invoices</span>
            </div>

            <div className="flex items-center justify-between p-2.5 rounded bg-[#F8F9FA] border border-[#E3E8F0]">
              <span className="text-[#697586]">Average Simulated OCR Confidence:</span>
              <span className="font-mono font-bold text-[#16865C]">96.8%</span>
            </div>

            <div className="flex items-center justify-between p-2.5 rounded bg-[#F8F9FA] border border-[#E3E8F0]">
              <span className="text-[#697586]">Straight-Through Processing (STP) Rate:</span>
              <span className="font-mono font-bold text-[#356AE6]">
                {Math.round(
                  ((invoices.length - validationStats.criticalIssuesCount) / (invoices.length || 1)) * 100
                )}
                %
              </span>
            </div>

            <p className="text-[11px] text-[#697586] leading-relaxed pt-2">
              <strong>Notice:</strong> All report calculations in this prototype reflect local demo data and simulated AI
              models. When connected to FastAPI, reports will query PostgreSQL analytics views with true OCR coordinates.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
