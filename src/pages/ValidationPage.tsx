import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  Search,
  Filter,
  FileSearch,
  Send,
  Download,
  RotateCw,
  ExternalLink,
} from 'lucide-react';
import { useInvoices } from '../context/InvoiceContext';
import { useToast } from '../context/ToastContext';
import { ExportService } from '../services/exportService';
import { ValidationIssue } from '../types/invoice';

export const ValidationPage: React.FC = () => {
  const navigate = useNavigate();
  const { invoices, validationIssues, validationStats, changeReviewStatus, runValidationCheck } = useInvoices();
  const toast = useToast();

  const [search, setSearch] = useState('');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [ruleFilter, setRuleFilter] = useState<string>('all');

  const filteredIssues = useMemo(() => {
    return validationIssues.filter((iss) => {
      const matchesSearch =
        iss.invoiceNumber.toLowerCase().includes(search.toLowerCase()) ||
        iss.vendorName.toLowerCase().includes(search.toLowerCase()) ||
        iss.ruleTitle.toLowerCase().includes(search.toLowerCase()) ||
        iss.field.toLowerCase().includes(search.toLowerCase());

      const matchesSeverity =
        severityFilter === 'all' || iss.severity === severityFilter;

      const matchesRule =
        ruleFilter === 'all' || iss.ruleId === ruleFilter;

      return matchesSearch && matchesSeverity && matchesRule;
    });
  }, [validationIssues, search, severityFilter, ruleFilter]);

  const handleExportIssues = () => {
    ExportService.exportValidationIssuesCSV(filteredIssues);
    toast.success('Export Generated', `Exported ${filteredIssues.length} validation issues to CSV.`);
  };

  const handleSendToReview = async (issue: ValidationIssue) => {
    try {
      await changeReviewStatus(
        issue.invoiceId,
        'in_review',
        'Validation Engine',
        `Flagged automatically by rule: ${issue.ruleTitle}. Discrepancy: ${issue.explanation}`
      );
    } catch {
      return; // error already shown; don't claim success
    }
    toast.info('Invoice Sent to Review', `Invoice ${issue.invoiceNumber} is now queued for human review.`);
  };

  const handleRunRecheck = async () => {
    try {
      await runValidationCheck();
      toast.success('Validation Run Completed', 'Re-evaluated all deterministic checks across active dataset.');
    } catch {
      /* error already shown */
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Title & Top Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[#172B4D] tracking-tight">
            Financial Validation Center
          </h1>
          <p className="text-xs text-[#697586] mt-0.5">
            Deterministic rules engine auditing line math, totals reconciliation, date logic, and vendor integrity
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleRunRecheck}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#172B4D] bg-white border border-[#E3E8F0] hover:bg-[#F7F9FC] rounded-lg transition-colors shadow-xs"
          >
            <RotateCw className="w-3.5 h-3.5 text-[#356AE6]" />
            Re-run Validation
          </button>
          <button
            onClick={handleExportIssues}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#356AE6] hover:bg-[#2955BF] rounded-lg transition-colors shadow-xs"
          >
            <Download className="w-3.5 h-3.5" />
            Export Issues CSV
          </button>
        </div>
      </div>

      {/* Validation Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-lg border border-[#E3E8F0]">
          <div className="flex items-center justify-between text-xs text-[#697586]">
            <span>Invoices Audited</span>
            <span className="p-1.5 rounded-md bg-[#F2F6FF] text-[#356AE6]">
              <ShieldAlert className="w-4 h-4" />
            </span>
          </div>
          <div className="text-2xl font-bold text-[#172B4D] font-mono tabular-nums mt-2">
            {validationStats.totalInvoices}
          </div>
          <p className="text-[11px] text-[#697586] mt-1">100% evaluated with ±$0.02 tolerance</p>
        </div>

        <div className="bg-white p-4 rounded-lg border border-[#E3E8F0]">
          <div className="flex items-center justify-between text-xs text-[#697586]">
            <span>Passed Validation</span>
            <span className="p-1.5 rounded-md bg-[#ECFDF3] text-[#16865C]">
              <CheckCircle2 className="w-4 h-4" />
            </span>
          </div>
          <div className="text-2xl font-bold text-[#16865C] font-mono tabular-nums mt-2">
            {validationStats.passedValidations}
          </div>
          <p className="text-[11px] text-[#697586] mt-1">
            {Math.round((validationStats.passedValidations / (validationStats.totalInvoices || 1)) * 100)}% clean execution
          </p>
        </div>

        <div className="bg-white p-4 rounded-lg border border-[#E3E8F0]">
          <div className="flex items-center justify-between text-xs text-[#697586]">
            <span>Critical Discrepancies</span>
            <span className="p-1.5 rounded-md bg-[#FEF3F2] text-[#D64545]">
              <AlertOctagon className="w-4 h-4" />
            </span>
          </div>
          <div className="text-2xl font-bold text-[#D64545] font-mono tabular-nums mt-2">
            {validationStats.criticalIssuesCount}
          </div>
          <p className="text-[11px] text-[#D64545] font-medium mt-1">Immediate review required</p>
        </div>

        <div className="bg-white p-4 rounded-lg border border-[#E3E8F0]">
          <div className="flex items-center justify-between text-xs text-[#697586]">
            <span>Audit Warnings</span>
            <span className="p-1.5 rounded-md bg-[#FFFAEB] text-[#C98512]">
              <AlertTriangle className="w-4 h-4" />
            </span>
          </div>
          <div className="text-2xl font-bold text-[#C98512] font-mono tabular-nums mt-2">
            {validationStats.warningsCount}
          </div>
          <p className="text-[11px] text-[#697586] mt-1">Missing optional metadata/tax IDs</p>
        </div>
      </div>

      {/* Discrepancies Table Container */}
      <div className="bg-white rounded-lg border border-[#E3E8F0] overflow-hidden">
        {/* Table Filter Bar */}
        <div className="p-4 border-b border-[#E3E8F0] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-[#172B4D]">Detected Audit Discrepancies</h3>
            <p className="text-xs text-[#697586]">
              Showing {filteredIssues.length} issues across accounts payable records
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Search */}
            <div className="flex items-center bg-[#F7F9FC] border border-[#E3E8F0] focus-within:border-[#356AE6] rounded-md px-2.5 py-1.5 text-xs w-52">
              <Search className="w-3.5 h-3.5 text-[#697586] mr-1.5 shrink-0" />
              <input
                type="text"
                placeholder="Search issues, rules..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-transparent text-[#172B4D] placeholder-[#697586] focus:outline-hidden"
              />
            </div>

            {/* Severity Filter */}
            <div className="flex items-center bg-[#F7F9FC] border border-[#E3E8F0] rounded-md px-2 py-1.5 text-xs text-[#172B4D]">
              <Filter className="w-3.5 h-3.5 text-[#697586] mr-1.5" />
              <select
                value={severityFilter}
                onChange={(e) => setSeverityFilter(e.target.value)}
                className="bg-transparent focus:outline-hidden text-xs font-medium"
              >
                <option value="all">All Severities</option>
                <option value="critical">Critical Only</option>
                <option value="warning">Warnings Only</option>
              </select>
            </div>
          </div>
        </div>

        {/* Table Body */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#F8F9FA] text-[11px] font-semibold text-[#697586] uppercase tracking-wider border-b border-[#E3E8F0]">
                <th className="py-2.5 px-4">Severity</th>
                <th className="py-2.5 px-4">Invoice #</th>
                <th className="py-2.5 px-4">Vendor</th>
                <th className="py-2.5 px-4">Rule & Field</th>
                <th className="py-2.5 px-4">Extracted Value</th>
                <th className="py-2.5 px-4">Expected Value</th>
                <th className="py-2.5 px-4">Explanation & Recommendation</th>
                <th className="py-2.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E3E8F0] text-xs">
              {filteredIssues.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-[#697586]">
                    <CheckCircle2 className="w-8 h-8 text-[#16865C] mx-auto mb-2" />
                    <p className="font-semibold text-sm text-[#172B4D]">No Discrepancies Found</p>
                    <p className="text-xs text-[#697586] mt-0.5">
                      All audited invoices conform to mathematical and structural financial rules.
                    </p>
                  </td>
                </tr>
              ) : (
                filteredIssues.map((issue) => (
                  <tr key={issue.id} className="hover:bg-[#F2F6FF]/40 transition-colors">
                    <td className="py-3 px-4 whitespace-nowrap">
                      {issue.severity === 'critical' ? (
                        <span className="inline-flex items-center gap-1 font-semibold text-[11px] text-[#D64545] bg-[#FEF3F2] px-2 py-0.5 rounded border border-[#FECDCA]">
                          <AlertOctagon className="w-3 h-3" />
                          Critical
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 font-semibold text-[11px] text-[#C98512] bg-[#FFFAEB] px-2 py-0.5 rounded border border-[#FEDF89]">
                          <AlertTriangle className="w-3 h-3" />
                          Warning
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 font-mono font-medium text-[#172B4D]">
                      {issue.invoiceNumber}
                    </td>
                    <td className="py-3 px-4 font-medium text-[#172B4D] truncate max-w-[150px]">
                      {issue.vendorName}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-[#172B4D] truncate max-w-[180px]">
                        {issue.ruleTitle}
                      </div>
                      <span className="font-mono text-[10px] text-[#697586]">
                        {issue.field}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-700 whitespace-nowrap">
                      {issue.extractedValue}
                    </td>
                    <td className="py-3 px-4 font-mono text-[#16865C] font-semibold whitespace-nowrap">
                      {issue.expectedValue || <span className="text-slate-400 font-normal italic">—</span>}
                    </td>
                    <td className="py-3 px-4 min-w-[260px] max-w-sm">
                      <p className="text-[#172B4D] leading-snug">{issue.explanation}</p>
                      <p className="text-[11px] text-[#697586] mt-1 font-medium">
                        Action: {issue.suggestedAction}
                      </p>
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleSendToReview(issue)}
                          className="p-1.5 text-[#C98512] hover:bg-[#FFFAEB] rounded-md transition-colors"
                          title="Send to Review Queue"
                        >
                          <Send className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => navigate(`/extraction/${issue.invoiceId}`)}
                          className="p-1.5 text-[#356AE6] hover:bg-[#EFF8FF] rounded-md transition-colors"
                          title="Open Invoice in Extraction Studio"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
