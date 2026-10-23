import React from 'react';
import { Plus, Trash2, Calculator } from 'lucide-react';
import { LineItem } from '../../types/invoice';
import { calculateLineTotal } from '../../utils/calculations';
import { formatCurrency } from '../../utils/currency';

interface LineItemsTableProps {
  lineItems: LineItem[];
  currency: string;
  onChange: (items: LineItem[]) => void;
}

export const LineItemsTable: React.FC<LineItemsTableProps> = ({
  lineItems,
  currency,
  onChange,
}) => {
  const handleItemChange = (index: number, field: keyof LineItem, val: string | number) => {
    const updated = [...lineItems];
    const current = { ...updated[index], [field]: val, isManuallyEdited: true };

    // Auto recalculate line total when qty or unit price changes
    if (field === 'quantity' || field === 'unitPrice' || field === 'discount') {
      current.lineTotal = calculateLineTotal(current);
    }

    updated[index] = current;
    onChange(updated);
  };

  const handleAddItem = () => {
    const newItem: LineItem = {
      id: `li-manual-${Date.now()}`,
      description: 'New Services / Products',
      quantity: 1,
      unitPrice: 100.0,
      discount: 0,
      taxRate: 8.5,
      lineTotal: 100.0,
      isManuallyEdited: true,
    };
    onChange([...lineItems, newItem]);
  };

  const handleRemoveItem = (index: number) => {
    const updated = lineItems.filter((_, idx) => idx !== index);
    onChange(updated);
  };

  return (
    <div className="bg-white rounded-lg border border-[#E3E8F0] overflow-hidden">
      <div className="p-3.5 border-b border-[#E3E8F0] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calculator className="w-4 h-4 text-[#356AE6]" />
          <div>
            <h3 className="text-xs font-semibold text-[#172B4D]">Extracted Line Items</h3>
            <p className="text-[11px] text-[#697586]">
              {lineItems.length} items parsed. Quantities and unit prices are editable.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleAddItem}
          className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-[#356AE6] bg-[#EFF8FF] hover:bg-[#D9E8FF] rounded-md transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Item
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-[#F8F9FA] text-[11px] font-semibold text-[#697586] uppercase tracking-wider border-b border-[#E3E8F0]">
              <th className="py-2 px-3 min-w-[200px]">Description</th>
              <th className="py-2 px-2 text-right w-20">Qty</th>
              <th className="py-2 px-2 text-right w-28">Unit Price</th>
              <th className="py-2 px-2 text-right w-20">Disc</th>
              <th className="py-2 px-2 text-right w-20">Tax %</th>
              <th className="py-2 px-3 text-right w-32">Line Total</th>
              <th className="py-2 px-2 text-center w-12">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E3E8F0]">
            {lineItems.map((item, index) => {
              const computed = calculateLineTotal(item);
              const hasDiscrepancy = Math.abs(computed - item.lineTotal) > 0.02;

              return (
                <tr key={item.id || index} className="hover:bg-[#F2F6FF]/40 transition-colors">
                  <td className="p-2">
                    <input
                      type="text"
                      value={item.description}
                      onChange={(e) => handleItemChange(index, 'description', e.target.value)}
                      className="w-full px-2 py-1 bg-white border border-[#E3E8F0] focus:border-[#356AE6] rounded text-xs text-[#172B4D] focus:outline-hidden"
                    />
                  </td>
                  <td className="p-2 text-right">
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={item.quantity}
                      onChange={(e) =>
                        handleItemChange(index, 'quantity', parseFloat(e.target.value) || 0)
                      }
                      className="w-16 px-1.5 py-1 bg-white border border-[#E3E8F0] focus:border-[#356AE6] rounded text-xs text-right font-mono text-[#172B4D] tabular-nums focus:outline-hidden"
                    />
                  </td>
                  <td className="p-2 text-right">
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={item.unitPrice}
                      onChange={(e) =>
                        handleItemChange(index, 'unitPrice', parseFloat(e.target.value) || 0)
                      }
                      className="w-24 px-1.5 py-1 bg-white border border-[#E3E8F0] focus:border-[#356AE6] rounded text-xs text-right font-mono text-[#172B4D] tabular-nums focus:outline-hidden"
                    />
                  </td>
                  <td className="p-2 text-right">
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={item.discount}
                      onChange={(e) =>
                        handleItemChange(index, 'discount', parseFloat(e.target.value) || 0)
                      }
                      className="w-16 px-1.5 py-1 bg-white border border-[#E3E8F0] focus:border-[#356AE6] rounded text-xs text-right font-mono text-[#172B4D] tabular-nums focus:outline-hidden"
                    />
                  </td>
                  <td className="p-2 text-right">
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={item.taxRate}
                      onChange={(e) =>
                        handleItemChange(index, 'taxRate', parseFloat(e.target.value) || 0)
                      }
                      className="w-16 px-1.5 py-1 bg-white border border-[#E3E8F0] focus:border-[#356AE6] rounded text-xs text-right font-mono text-[#172B4D] tabular-nums focus:outline-hidden"
                    />
                  </td>
                  <td className="p-2 text-right">
                    <div className="flex flex-col items-end">
                      <span
                        className={`font-mono font-semibold tabular-nums text-xs ${
                          hasDiscrepancy ? 'text-[#D64545]' : 'text-[#172B4D]'
                        }`}
                      >
                        {formatCurrency(item.lineTotal, currency)}
                      </span>
                      {hasDiscrepancy && (
                        <span className="text-[10px] text-[#D64545] font-mono">
                          Calc: {formatCurrency(computed, currency)}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="p-2 text-center">
                    <button
                      type="button"
                      onClick={() => handleRemoveItem(index)}
                      className="p-1 text-[#697586] hover:text-[#D64545] rounded"
                      aria-label="Remove line item"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
