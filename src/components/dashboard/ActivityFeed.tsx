import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Upload,
  CheckCircle2,
  AlertTriangle,
  ClipboardList,
  FileText,
  BarChart2,
  Clock,
  ArrowRight,
} from 'lucide-react';
import { useInvoices } from '../../context/InvoiceContext';
import { formatDateTime } from '../../utils/dates';

export const ActivityFeed: React.FC = () => {
  const navigate = useNavigate();
  const { auditLogs } = useInvoices();

  const recentEvents = auditLogs.slice(0, 5);

  const getEventIcon = (category: string, action: string) => {
    if (action.includes('APPROVED')) return <CheckCircle2 className="w-3.5 h-3.5 text-[#16865C]" />;
    if (action.includes('DISCREPANCY') || action.includes('DUPLICATE'))
      return <AlertTriangle className="w-3.5 h-3.5 text-[#D64545]" />;
    if (category === 'upload') return <Upload className="w-3.5 h-3.5 text-[#356AE6]" />;
    if (category === 'review') return <ClipboardList className="w-3.5 h-3.5 text-[#C98512]" />;
    return <Clock className="w-3.5 h-3.5 text-[#697586]" />;
  };

  return (
    <div className="bg-white rounded-lg border border-[#E3E8F0] p-5 flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between pb-3 border-b border-[#E3E8F0]">
          <h3 className="text-sm font-semibold text-[#172B4D]">Live Activity Feed</h3>
          <span className="text-[11px] text-[#697586]">System Audit Trail</span>
        </div>

        <div className="mt-4 space-y-3.5">
          {recentEvents.map((evt) => (
            <div key={evt.id} className="flex items-start gap-3 text-xs">
              <div className="p-1 rounded-md bg-[#F2F6FF] mt-0.5 shrink-0">
                {getEventIcon(evt.category, evt.action)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[#172B4D] font-medium leading-snug line-clamp-2">
                  {evt.description}
                </p>
                <div className="flex items-center gap-2 mt-1 text-[11px] text-[#697586]">
                  <span>{evt.actor}</span>
                  <span>·</span>
                  <span>{formatDateTime(evt.timestamp)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Quick Action Area */}
      <div className="mt-6 pt-4 border-t border-[#E3E8F0]">
        <div className="text-xs font-semibold text-[#172B4D] mb-2.5">Quick Actions</div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <button
            onClick={() => navigate('/documents')}
            className="flex items-center justify-between px-3 py-2 bg-[#F2F6FF] hover:bg-[#E3E8F0] text-[#172B4D] text-xs font-medium rounded-lg transition-colors group"
          >
            <span className="flex items-center gap-2">
              <Upload className="w-3.5 h-3.5 text-[#356AE6]" />
              Upload Invoices
            </span>
            <ArrowRight className="w-3.5 h-3.5 text-[#697586] group-hover:translate-x-0.5 transition-transform" />
          </button>

          <button
            onClick={() => navigate('/review')}
            className="flex items-center justify-between px-3 py-2 bg-[#F2F6FF] hover:bg-[#E3E8F0] text-[#172B4D] text-xs font-medium rounded-lg transition-colors group"
          >
            <span className="flex items-center gap-2">
              <ClipboardList className="w-3.5 h-3.5 text-[#C98512]" />
              Review Queue
            </span>
            <ArrowRight className="w-3.5 h-3.5 text-[#697586] group-hover:translate-x-0.5 transition-transform" />
          </button>

          <button
            onClick={() => navigate('/reports')}
            className="flex items-center justify-between px-3 py-2 bg-[#F2F6FF] hover:bg-[#E3E8F0] text-[#172B4D] text-xs font-medium rounded-lg transition-colors group"
          >
            <span className="flex items-center gap-2">
              <BarChart2 className="w-3.5 h-3.5 text-[#16865C]" />
              View Reports
            </span>
            <ArrowRight className="w-3.5 h-3.5 text-[#697586] group-hover:translate-x-0.5 transition-transform" />
          </button>
        </div>
      </div>
    </div>
  );
};
