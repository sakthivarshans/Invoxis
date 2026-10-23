import React from 'react';
import { InvoiceMetrics } from '../components/dashboard/InvoiceMetrics';
import { ProcessingChart } from '../components/dashboard/ProcessingChart';
import { StatusDistributionChart } from '../components/dashboard/StatusDistributionChart';
import { ValidationIssuesChart } from '../components/dashboard/ValidationIssuesChart';
import { RecentInvoicesTable } from '../components/dashboard/RecentInvoicesTable';
import { ActivityFeed } from '../components/dashboard/ActivityFeed';
import { ArrowUpRight, Upload } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export const DashboardPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="space-y-6">
      {/* Page Title & Top Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[#172B4D] tracking-tight">Executive Dashboard</h1>
          <p className="text-xs text-[#697586] mt-0.5">
            Real-time financial document intake, validation status, and pipeline telemetry
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => navigate('/documents')}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-[#356AE6] hover:bg-[#2955BF] rounded-lg transition-colors shadow-xs"
          >
            <Upload className="w-3.5 h-3.5" />
            Upload Invoices
          </button>
          <button
            onClick={() => navigate('/validation')}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-[#172B4D] bg-white border border-[#E3E8F0] hover:bg-[#F7F9FC] rounded-lg transition-colors shadow-xs"
          >
            Validation Center
            <ArrowUpRight className="w-3.5 h-3.5 text-[#697586]" />
          </button>
        </div>
      </div>

      {/* 6 High-Impact Metric Cards */}
      <InvoiceMetrics />

      {/* Primary Analytics Section: 2 Columns */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <ProcessingChart />
        </div>
        <div className="space-y-6">
          <StatusDistributionChart />
        </div>
      </div>

      {/* Lower Analytics Section & Invoices */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <RecentInvoicesTable />
        </div>
        <div>
          <ValidationIssuesChart />
        </div>
      </div>

      {/* Activity Trail & Shortcuts */}
      <ActivityFeed />
    </div>
  );
};
