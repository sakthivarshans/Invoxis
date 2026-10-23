import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUpRight, FileSearch } from 'lucide-react';
import { useInvoices } from '../../context/InvoiceContext';
import { StatusBadge } from '../common/StatusBadge';
import { formatCurrency } from '../../utils/currency';
import { formatDate } from '../../utils/dates';

export const RecentInvoicesTable: React.FC = () => {
  const navigate = useNavigate();
  const { invoices } = useInvoices();

  // Show 6 most recent invoices
  const recentInvoices = [...invoices].slice(0, 6);

  return (
    <div className="bg-white rounded-lg border border-[#E3E8F0] overflow-hidden">
      <div className="p-4 border-b border-[#E3E8F0] flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-[#172B4D]">Recent Invoices</h3>
          <p className="text-xs text-[#697586]">Latest ingested financial documents requiring review or approval</p>
        </div>
        <button
          onClick={() => navigate('/history')}
          className="text-xs font-medium text-[#356AE6] hover:text-[#2955BF] flex items-center gap-1 transition-colors"
        >
          View all register
          <ArrowUpRight className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-[#F8F9FA] text-[11px] font-semibold text-[#697586] uppercase tracking-wider border-b border-[#E3E8F0]">
              <th className="py-2.5 px-4">Invoice #</th>
              <th className="py-2.5 px-4">Vendor</th>
              <th className="py-2.5 px-4">Date</th>
              <th className="py-2.5 px-4 text-right">Total Amount</th>
              <th className="py-2.5 px-4">Processing</th>
              <th className="py-2.5 px-4">Validation</th>
              <th className="py-2.5 px-4 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E3E8F0] text-xs">
            {recentInvoices.map((inv) => (
              <tr
                key={inv.id}
                className="hover:bg-[#F2F6FF]/60 transition-colors group cursor-pointer"
                onClick={() => navigate(`/extraction/${inv.id}`)}
              >
                <td className="py-3 px-4 font-mono font-medium text-[#172B4D]">
                  {inv.invoiceNumber || <span className="text-slate-400 italic">Unassigned</span>}
                </td>
                <td className="py-3 px-4 font-medium text-[#172B4D] truncate max-w-[180px]">
                  {inv.vendorName || <span className="text-slate-400 italic">Unknown</span>}
                </td>
                <td className="py-3 px-4 text-[#697586] whitespace-nowrap">
                  {formatDate(inv.invoiceDate, 'MMM DD, YYYY')}
                </td>
                <td className="py-3 px-4 text-right font-mono font-semibold text-[#172B4D] tabular-nums whitespace-nowrap">
                  {formatCurrency(inv.grandTotal, inv.currency)}
                </td>
                <td className="py-3 px-4">
                  <StatusBadge type="processing" status={inv.processingStatus} />
                </td>
                <td className="py-3 px-4">
                  <StatusBadge type="validation" status={inv.validationStatus} />
                </td>
                <td className="py-3 px-4 text-right whitespace-nowrap">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/extraction/${inv.id}`);
                    }}
                    className="p-1.5 text-[#356AE6] hover:bg-[#EFF8FF] rounded-md transition-colors"
                    title="Open Extraction Studio"
                  >
                    <FileSearch className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
