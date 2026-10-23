import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { useInvoices } from '../../context/InvoiceContext';

export const StatusDistributionChart: React.FC = () => {
  const { invoices } = useInvoices();

  const approvedCount = invoices.filter((i) => i.reviewStatus === 'approved').length;
  const pendingCount = invoices.filter((i) => i.reviewStatus === 'pending' || i.reviewStatus === 'in_review').length;
  const criticalCount = invoices.filter((i) => i.validationStatus === 'critical' && i.processingStatus !== 'failed').length;
  const failedCount = invoices.filter((i) => i.processingStatus === 'failed').length;

  const data = [
    { name: 'Approved', value: approvedCount, color: '#16865C' },
    { name: 'Pending Review', value: pendingCount, color: '#C98512' },
    { name: 'Discrepancy', value: criticalCount, color: '#356AE6' },
    { name: 'Failed Intake', value: failedCount, color: '#D64545' },
  ].filter((d) => d.value > 0);

  return (
    <div className="bg-white p-5 rounded-lg border border-[#E3E8F0]">
      <div className="mb-2">
        <h3 className="text-sm font-semibold text-[#172B4D]">Invoice Status Breakdown</h3>
        <p className="text-xs text-[#697586]">Distribution across approval workflows</p>
      </div>

      <div className="h-52 w-full flex items-center justify-center">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              innerRadius={50}
              outerRadius={75}
              paddingAngle={3}
              dataKey="value"
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const item = payload[0].payload;
                  return (
                    <div className="bg-[#172B4D] text-white p-2 rounded shadow text-xs">
                      <span className="font-medium">{item.name}</span>: <span className="font-mono font-bold">{item.value}</span> invoices
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
        {data.map((item) => (
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
  );
};
