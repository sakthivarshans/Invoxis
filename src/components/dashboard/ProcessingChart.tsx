import React from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { useInvoices } from '../../context/InvoiceContext';
import { formatDate } from '../../utils/dates';

export const ProcessingChart: React.FC = () => {
  const { invoices } = useInvoices();

  // Aggregate invoices by upload date (day)
  const dateCounts: Record<string, { date: string; displayDate: string; count: number; volume: number }> = {};

  invoices.forEach((inv) => {
    const rawDate = inv.uploadDate ? inv.uploadDate.split('T')[0] : '2026-10-14';
    if (!dateCounts[rawDate]) {
      dateCounts[rawDate] = {
        date: rawDate,
        displayDate: formatDate(rawDate, 'MMM DD'),
        count: 0,
        volume: 0,
      };
    }
    dateCounts[rawDate].count += 1;
    dateCounts[rawDate].volume += inv.grandTotal;
  });

  const data = Object.values(dateCounts).sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="bg-white p-5 rounded-lg border border-[#E3E8F0]">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-[#172B4D]">Processing Volume Over Time</h3>
          <p className="text-xs text-[#697586]">Daily intake count of invoices processed through AI pipeline</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-[#697586]">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#356AE6]" />
            Documents Ingested
          </span>
        </div>
      </div>

      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="volumeGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#356AE6" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#356AE6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E3E8F0" />
            <XAxis
              dataKey="displayDate"
              tickLine={false}
              axisLine={{ stroke: '#E3E8F0' }}
              tick={{ fontSize: 11, fill: '#697586' }}
            />
            <YAxis
              allowDecimals={false}
              tickLine={false}
              axisLine={{ stroke: '#E3E8F0' }}
              tick={{ fontSize: 11, fill: '#697586' }}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const item = payload[0].payload;
                  return (
                    <div className="bg-[#172B4D] text-white p-2.5 rounded-md shadow-lg text-xs font-sans">
                      <div className="font-semibold text-slate-200">{item.displayDate}</div>
                      <div className="text-slate-300 mt-1">
                        Invoices: <span className="font-mono font-bold text-white">{item.count}</span>
                      </div>
                      <div className="text-slate-300">
                        Value: <span className="font-mono text-white">${Math.round(item.volume).toLocaleString()}</span>
                      </div>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Area
              type="monotone"
              dataKey="count"
              stroke="#356AE6"
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#volumeGradient)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
