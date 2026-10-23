import React from 'react';
import { Invoice } from '../../types/invoice';
import { FieldStatusBadge, FieldStatusType } from './FieldStatusBadge';
import { calculateExpectedGrandTotal, calculateSubtotal } from '../../utils/calculations';

interface InvoiceFieldsFormProps {
  invoice: Invoice;
  onChange: (updates: Partial<Invoice>) => void;
}

export const InvoiceFieldsForm: React.FC<InvoiceFieldsFormProps> = ({ invoice, onChange }) => {
  const getFieldStatus = (fieldName: keyof Invoice, val: any): FieldStatusType => {
    if (!val || String(val).trim() === '') {
      if (['invoiceNumber', 'vendorName', 'invoiceDate', 'currency'].includes(fieldName)) {
        return 'missing';
      }
      return 'missing';
    }

    // Backend mode: the extractor flagged this value for verification (and the user hasn't corrected it yet).
    if (invoice.fieldWarnings?.[fieldName as string]) {
      return 'warning';
    }

    if (fieldName === 'dueDate' && invoice.invoiceDate) {
      if (new Date(invoice.dueDate).getTime() < new Date(invoice.invoiceDate).getTime()) {
        return 'warning';
      }
    }

    if (fieldName === 'grandTotal') {
      const expected = calculateExpectedGrandTotal(
        invoice.subtotal,
        invoice.taxAmount,
        invoice.shippingCharges,
        invoice.discount
      );
      if (Math.abs(expected - invoice.grandTotal) > 0.02) {
        return 'warning';
      }
    }

    if (invoice.isManuallyEdited) {
      return 'manual';
    }

    return 'valid';
  };

  const expectedGrandTotal = calculateExpectedGrandTotal(
    invoice.subtotal,
    invoice.taxAmount,
    invoice.shippingCharges,
    invoice.discount
  );

  const grandTotalDiscrepancy = Math.abs(expectedGrandTotal - invoice.grandTotal) > 0.02;

  const handleRecalculateTotals = () => {
    const computedSubtotal = calculateSubtotal(invoice.lineItems);
    const newGrandTotal = calculateExpectedGrandTotal(
      computedSubtotal,
      invoice.taxAmount,
      invoice.shippingCharges,
      invoice.discount
    );
    onChange({
      subtotal: computedSubtotal,
      grandTotal: newGrandTotal,
    });
  };

  return (
    <div className="space-y-4">
      {/* Group 1: Invoice Header & Dates */}
      <div className="bg-white rounded-lg border border-[#E3E8F0] p-4">
        <h3 className="text-xs font-semibold text-[#172B4D] uppercase tracking-wider mb-3">
          Invoice Identification & Dates
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[11px] font-medium text-[#697586]">Invoice Number</label>
              <FieldStatusBadge status={getFieldStatus('invoiceNumber', invoice.invoiceNumber)} />
            </div>
            <input
              type="text"
              value={invoice.invoiceNumber}
              onChange={(e) => onChange({ invoiceNumber: e.target.value })}
              className="w-full px-2.5 py-1.5 bg-[#F8F9FA] border border-[#E3E8F0] focus:border-[#356AE6] rounded text-xs font-mono font-medium text-[#172B4D] focus:outline-hidden"
              placeholder="e.g. INV-84291"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[11px] font-medium text-[#697586]">Invoice Date</label>
              <FieldStatusBadge status={getFieldStatus('invoiceDate', invoice.invoiceDate)} />
            </div>
            <input
              type="date"
              value={invoice.invoiceDate}
              onChange={(e) => onChange({ invoiceDate: e.target.value })}
              className="w-full px-2.5 py-1.5 bg-[#F8F9FA] border border-[#E3E8F0] focus:border-[#356AE6] rounded text-xs text-[#172B4D] focus:outline-hidden"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[11px] font-medium text-[#697586]">Payment Due Date</label>
              <FieldStatusBadge status={getFieldStatus('dueDate', invoice.dueDate)} />
            </div>
            <input
              type="date"
              value={invoice.dueDate}
              onChange={(e) => onChange({ dueDate: e.target.value })}
              className="w-full px-2.5 py-1.5 bg-[#F8F9FA] border border-[#E3E8F0] focus:border-[#356AE6] rounded text-xs text-[#172B4D] focus:outline-hidden"
            />
          </div>

          <div>
            <label className="text-[11px] font-medium text-[#697586] block mb-1">Payment Terms</label>
            <input
              type="text"
              value={invoice.paymentTerms}
              onChange={(e) => onChange({ paymentTerms: e.target.value })}
              className="w-full px-2.5 py-1.5 bg-[#F8F9FA] border border-[#E3E8F0] focus:border-[#356AE6] rounded text-xs text-[#172B4D] focus:outline-hidden"
              placeholder="e.g. Net 30"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="text-[11px] font-medium text-[#697586] block mb-1">Payment Reference</label>
            <input
              type="text"
              value={invoice.paymentReference}
              onChange={(e) => onChange({ paymentReference: e.target.value })}
              className="w-full px-2.5 py-1.5 bg-[#F8F9FA] border border-[#E3E8F0] focus:border-[#356AE6] rounded text-xs font-mono text-[#172B4D] focus:outline-hidden"
              placeholder="Wire/ACH or Check Reference"
            />
          </div>
        </div>
      </div>

      {/* Group 2: Vendor & Customer Profiles */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Vendor */}
        <div className="bg-white rounded-lg border border-[#E3E8F0] p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold text-[#172B4D] uppercase tracking-wider">
              Vendor Information
            </h3>
            <FieldStatusBadge status={getFieldStatus('vendorName', invoice.vendorName)} />
          </div>

          <div className="space-y-2.5">
            <div>
              <label className="text-[11px] text-[#697586] block mb-0.5">Legal Vendor Name</label>
              <input
                type="text"
                value={invoice.vendorName}
                onChange={(e) => onChange({ vendorName: e.target.value })}
                className="w-full px-2.5 py-1.5 bg-[#F8F9FA] border border-[#E3E8F0] focus:border-[#356AE6] rounded text-xs font-medium text-[#172B4D] focus:outline-hidden"
              />
            </div>

            <div>
              <label className="text-[11px] text-[#697586] block mb-0.5">Address</label>
              <input
                type="text"
                value={invoice.vendorAddress}
                onChange={(e) => onChange({ vendorAddress: e.target.value })}
                className="w-full px-2.5 py-1.5 bg-[#F8F9FA] border border-[#E3E8F0] focus:border-[#356AE6] rounded text-xs text-[#172B4D] focus:outline-hidden"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] text-[#697586] block mb-0.5">Tax / VAT ID</label>
                <input
                  type="text"
                  value={invoice.vendorTaxId}
                  onChange={(e) => onChange({ vendorTaxId: e.target.value })}
                  className="w-full px-2.5 py-1.5 bg-[#F8F9FA] border border-[#E3E8F0] focus:border-[#356AE6] rounded text-xs font-mono text-[#172B4D] focus:outline-hidden"
                />
              </div>
              <div>
                <label className="text-[11px] text-[#697586] block mb-0.5">Email</label>
                <input
                  type="email"
                  value={invoice.vendorEmail || ''}
                  onChange={(e) => onChange({ vendorEmail: e.target.value })}
                  className="w-full px-2.5 py-1.5 bg-[#F8F9FA] border border-[#E3E8F0] focus:border-[#356AE6] rounded text-xs text-[#172B4D] focus:outline-hidden"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Customer / Bill To */}
        <div className="bg-white rounded-lg border border-[#E3E8F0] p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold text-[#172B4D] uppercase tracking-wider">
              Customer / Bill To
            </h3>
            <FieldStatusBadge status={getFieldStatus('customerName', invoice.customerName)} />
          </div>

          <div className="space-y-2.5">
            <div>
              <label className="text-[11px] text-[#697586] block mb-0.5">Customer Name</label>
              <input
                type="text"
                value={invoice.customerName}
                onChange={(e) => onChange({ customerName: e.target.value })}
                className="w-full px-2.5 py-1.5 bg-[#F8F9FA] border border-[#E3E8F0] focus:border-[#356AE6] rounded text-xs font-medium text-[#172B4D] focus:outline-hidden"
              />
            </div>

            <div>
              <label className="text-[11px] text-[#697586] block mb-0.5">Billing Address</label>
              <input
                type="text"
                value={invoice.customerAddress}
                onChange={(e) => onChange({ customerAddress: e.target.value })}
                className="w-full px-2.5 py-1.5 bg-[#F8F9FA] border border-[#E3E8F0] focus:border-[#356AE6] rounded text-xs text-[#172B4D] focus:outline-hidden"
              />
            </div>

            <div>
              <label className="text-[11px] text-[#697586] block mb-0.5">Customer Tax ID</label>
              <input
                type="text"
                value={invoice.customerTaxId}
                onChange={(e) => onChange({ customerTaxId: e.target.value })}
                className="w-full px-2.5 py-1.5 bg-[#F8F9FA] border border-[#E3E8F0] focus:border-[#356AE6] rounded text-xs font-mono text-[#172B4D] focus:outline-hidden"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Group 3: Financial Summary & Verification */}
      <div className="bg-white rounded-lg border border-[#E3E8F0] p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-xs font-semibold text-[#172B4D] uppercase tracking-wider">
              Financial Summary & Calculations
            </h3>
            <p className="text-[11px] text-[#697586]">
              Subtotal + Tax + Shipping - Discount vs Grand Total
            </p>
          </div>

          {grandTotalDiscrepancy && (
            <button
              type="button"
              onClick={handleRecalculateTotals}
              className="text-[11px] font-medium text-[#356AE6] bg-[#EFF8FF] hover:bg-[#D9E8FF] px-2.5 py-1 rounded transition-colors"
            >
              Reconcile Totals Automatically
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div>
            <label className="text-[11px] font-medium text-[#697586] block mb-1">Currency</label>
            <select
              value={invoice.currency}
              onChange={(e) => onChange({ currency: e.target.value })}
              className="w-full px-2 py-1.5 bg-[#F8F9FA] border border-[#E3E8F0] focus:border-[#356AE6] rounded text-xs font-mono font-medium text-[#172B4D] focus:outline-hidden"
            >
              <option value="USD">USD ($)</option>
              <option value="EUR">EUR (€)</option>
              <option value="GBP">GBP (£)</option>
              <option value="CAD">CAD (CA$)</option>
            </select>
          </div>

          <div>
            <label className="text-[11px] font-medium text-[#697586] block mb-1">Subtotal</label>
            <input
              type="number"
              step="any"
              value={invoice.subtotal}
              onChange={(e) => onChange({ subtotal: parseFloat(e.target.value) || 0 })}
              className="w-full px-2 py-1.5 bg-[#F8F9FA] border border-[#E3E8F0] focus:border-[#356AE6] rounded text-xs font-mono text-right text-[#172B4D] tabular-nums focus:outline-hidden"
            />
          </div>

          <div>
            <label className="text-[11px] font-medium text-[#697586] block mb-1">Tax Amount</label>
            <input
              type="number"
              step="any"
              value={invoice.taxAmount}
              onChange={(e) => onChange({ taxAmount: parseFloat(e.target.value) || 0 })}
              className="w-full px-2 py-1.5 bg-[#F8F9FA] border border-[#E3E8F0] focus:border-[#356AE6] rounded text-xs font-mono text-right text-[#172B4D] tabular-nums focus:outline-hidden"
            />
          </div>

          <div>
            <label className="text-[11px] font-medium text-[#697586] block mb-1">Discount</label>
            <input
              type="number"
              step="any"
              value={invoice.discount}
              onChange={(e) => onChange({ discount: parseFloat(e.target.value) || 0 })}
              className="w-full px-2 py-1.5 bg-[#F8F9FA] border border-[#E3E8F0] focus:border-[#356AE6] rounded text-xs font-mono text-right text-[#172B4D] tabular-nums focus:outline-hidden"
            />
          </div>

          <div>
            <label className="text-[11px] font-medium text-[#697586] block mb-1">Shipping</label>
            <input
              type="number"
              step="any"
              value={invoice.shippingCharges}
              onChange={(e) => onChange({ shippingCharges: parseFloat(e.target.value) || 0 })}
              className="w-full px-2 py-1.5 bg-[#F8F9FA] border border-[#E3E8F0] focus:border-[#356AE6] rounded text-xs font-mono text-right text-[#172B4D] tabular-nums focus:outline-hidden"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[11px] font-bold text-[#172B4D]">Grand Total</label>
              <FieldStatusBadge status={getFieldStatus('grandTotal', invoice.grandTotal)} />
            </div>
            <input
              type="number"
              step="any"
              value={invoice.grandTotal}
              onChange={(e) => onChange({ grandTotal: parseFloat(e.target.value) || 0 })}
              className={`w-full px-2 py-1.5 border rounded text-xs font-mono font-bold text-right tabular-nums focus:outline-hidden ${
                grandTotalDiscrepancy
                  ? 'border-[#D64545] bg-[#FEF3F2] text-[#D64545]'
                  : 'border-[#E3E8F0] bg-[#F8F9FA] text-[#172B4D]'
              }`}
            />
          </div>
        </div>

        {grandTotalDiscrepancy && (
          <div className="mt-3 p-2 bg-[#FEF3F2] border border-[#FECDCA] rounded text-xs text-[#D64545] flex items-center justify-between">
            <span>
              <strong>Discrepancy Detected:</strong> Computed total is{' '}
              <span className="font-mono font-semibold">{invoice.currency} {expectedGrandTotal.toFixed(2)}</span>, but recorded as{' '}
              <span className="font-mono font-semibold">{invoice.currency} {invoice.grandTotal.toFixed(2)}</span>.
            </span>
            <button
              type="button"
              onClick={() => onChange({ grandTotal: expectedGrandTotal })}
              className="text-[11px] font-semibold underline hover:text-[#B42318] ml-2 shrink-0"
            >
              Apply Computed Total
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
