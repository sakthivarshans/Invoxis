import React from 'react';
import { Files, CheckCircle2, Clock, AlertOctagon, DollarSign, ShieldAlert } from 'lucide-react';
import { MetricCard } from '../common/MetricCard';
import { useInvoices } from '../../context/InvoiceContext';
import { formatCurrency } from '../../utils/currency';
import { useNavigate } from 'react-router-dom';

export const InvoiceMetrics: React.FC = () => {
  const navigate = useNavigate();
  const { invoices, validationStats } = useInvoices();

  const totalInvoices = invoices.length;
  const successfullyProcessed = invoices.filter((i) => i.processingStatus === 'completed').length;
  const pendingReview = invoices.filter((i) => i.reviewStatus === 'pending' || i.reviewStatus === 'in_review').length;
  const failedJobs = invoices.filter((i) => i.processingStatus === 'failed').length;

  const totalValueUSD = invoices.reduce((sum, inv) => {
    // If USD, add directly. If EUR or GBP, approximate conversion for dashboard total
    const rate = inv.currency === 'EUR' ? 1.08 : inv.currency === 'GBP' ? 1.25 : 1;
    return sum + (inv.grandTotal * rate);
  }, 0);

  const criticalIssuesCount = validationStats.criticalIssuesCount;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
      <MetricCard
        label="Total Invoices"
        value={totalInvoices}
        caption="All ingested documents"
        icon={Files}
        variant="default"
        onClick={() => navigate('/documents')}
      />

      <MetricCard
        label="Processed"
        value={successfullyProcessed}
        caption={`${Math.round((successfullyProcessed / (totalInvoices || 1)) * 100)}% extraction success`}
        icon={CheckCircle2}
        variant="success"
        onClick={() => navigate('/history')}
      />

      <MetricCard
        label="Pending Review"
        value={pendingReview}
        caption="Awaiting human sign-off"
        icon={Clock}
        variant={pendingReview > 0 ? 'warning' : 'default'}
        onClick={() => navigate('/review')}
      />

      <MetricCard
        label="Failed Jobs"
        value={failedJobs}
        caption="OCR/Resolution errors"
        icon={AlertOctagon}
        variant={failedJobs > 0 ? 'danger' : 'default'}
        onClick={() => navigate('/documents')}
      />

      <MetricCard
        label="Total Value (USD)"
        value={formatCurrency(totalValueUSD, 'USD')}
        caption="Active invoice ledger"
        icon={DollarSign}
        variant="blue"
        onClick={() => navigate('/reports')}
      />

      <MetricCard
        label="Validation Flags"
        value={criticalIssuesCount}
        caption="Requires finance resolution"
        icon={ShieldAlert}
        variant={criticalIssuesCount > 0 ? 'danger' : 'success'}
        onClick={() => navigate('/validation')}
      />
    </div>
  );
};
