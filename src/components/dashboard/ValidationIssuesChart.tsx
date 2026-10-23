import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { useInvoices } from '../../context/InvoiceContext';

export const ValidationIssuesChart: React.FC = () => {
  const { validationStats } = useInvoices();

  const ruleNamesMap: Record<string, string> = {
    MATH_LINE_ITEM_TOTAL: 'Line Math',
    MATH_SUBTOTAL_MISMATCH: 'Subtotal Sum',
    MATH_GRAND_TOTAL_MISMATCH: 'Grand Total',
    DATE_DUE_BEFORE_INVOICE: 'Due Date Error',
    TAX_VENDOR_ID_MISSING: 'Missing Tax ID',
    FRAUD_DUPLICATE_INVOICE: 'Duplicate Flag',
    JOB_EXTRACTION_FAILURE: 'OCR Fail',
    REQ_INVOICE_NUMBER: 'Missing Inv #',
  };

  const data = Object.entries(validationStats.issuesByRule || {}).map(([ruleId, count]) => ({
    ruleId,
    name: ruleNamesMap[ruleId] || ruleId.replace(/_/g, ' ').substring(0, 14),
    count,
  }));

  return (
    <div className="bg-white p-5 rounded-lg border border-[#E3E8F0]">
      <div className="mb-2">
        <h3 className="text-sm font-semibold text-[#172B4D]">Validation Issue Categories</h3>
        <p className="text-xs text-[#697586]">Breakdown of discrepancies caught by rules engine</p>
      </div>

      <div className="h-52 w-full">
        {data.length === 0 ? (
          <div className="h-full flex items-center justify-center text-xs text-[#697586]">
            No discrepancies recorded
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E3E8F0" />
              <XAxis type="number" allowDecimals={false} tickLine={false} tick={{ fontSize: 10, fill: '#697586' }} />
              <YAxis
                type="category"
                dataKey="name"
                tickLine={false}
                axisLine={{ stroke: '#E3E8F0' }}
                tick={{ fontSize: 11, fill: '#172B4D' }}
                width={85}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const item = payload[0].payload;
                    return (
                      <div className="bg-[#172B4D] text-white p-2 rounded shadow text-xs">
                        <div className="font-semibold">{item.name}</div>
                        <div className="text-slate-300 font-mono">
                          {item.count} flagged instances
                        </div>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Bar dataKey="count" fill="#356AE6" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="text-[11px] text-[#697586] pt-2 border-t border-[#E3E8F0] flex items-center justify-between">
        <span>Deterministic rules</span>
        <span className="font-medium text-[#172B4D]">Tolerance: ±$0.02</span>
      </div>
    </div>
  );
};
