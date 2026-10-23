import React, { useState } from 'react';
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  Download,
  ChevronLeft,
  ChevronRight,
  FileText,
  Building,
} from 'lucide-react';
import { Invoice } from '../../types/invoice';
import { formatCurrency } from '../../utils/currency';
import { formatDate } from '../../utils/dates';
import { IS_BACKEND } from '../../config';
import { backendService } from '../../services/invoiceService';

interface DocumentPreviewProps {
  invoice: Invoice;
}

export const DocumentPreview: React.FC<DocumentPreviewProps> = ({ invoice }) => {
  const [zoomLevel, setZoomLevel] = useState(100);
  const [currentPage, setCurrentPage] = useState(1);
  const totalPages = invoice.pageCount || 1;

  const handleZoomIn = () => setZoomLevel((prev) => Math.min(150, prev + 15));
  const handleZoomOut = () => setZoomLevel((prev) => Math.max(70, prev - 15));
  const handleResetZoom = () => setZoomLevel(100);

  const handleDownloadDoc = () => {
    // Generate text document representation
    const textContent = `================================================================================
VENDOR: ${invoice.vendorName}
ADDRESS: ${invoice.vendorAddress}
TAX ID: ${invoice.vendorTaxId}
EMAIL: ${invoice.vendorEmail || 'billing@vendor.com'}
--------------------------------------------------------------------------------
INVOICE NUMBER: ${invoice.invoiceNumber}
DATE: ${invoice.invoiceDate}
PAYMENT DUE: ${invoice.dueDate}
TERMS: ${invoice.paymentTerms}

BILL TO:
${invoice.customerName}
${invoice.customerAddress}
Tax ID: ${invoice.customerTaxId}
--------------------------------------------------------------------------------
ITEMS:
${invoice.lineItems
  .map(
    (item, idx) =>
      `${idx + 1}. ${item.description} | Qty: ${item.quantity} | Unit: ${formatCurrency(
        item.unitPrice,
        invoice.currency
      )} | Total: ${formatCurrency(item.lineTotal, invoice.currency)}`
  )
  .join('\n')}
--------------------------------------------------------------------------------
SUBTOTAL:   ${formatCurrency(invoice.subtotal, invoice.currency)}
TAX:        ${formatCurrency(invoice.taxAmount, invoice.currency)}
DISCOUNT:   ${formatCurrency(invoice.discount, invoice.currency)}
SHIPPING:   ${formatCurrency(invoice.shippingCharges, invoice.currency)}
GRAND TOTAL:${formatCurrency(invoice.grandTotal, invoice.currency)}
================================================================================`;

    const blob = new Blob([textContent], { type: 'text/plain;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${invoice.fileName || invoice.invoiceNumber}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-[#172B4D] rounded-lg border border-[#243B5A] flex flex-col h-full overflow-hidden text-slate-200">
      {/* Top Document Toolbar */}
      <div className="h-12 bg-[#0F1D33] px-3 border-b border-[#243B5A] flex items-center justify-between text-xs shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <FileText className="w-4 h-4 text-[#356AE6] shrink-0" />
          <span className="font-medium text-white truncate max-w-[180px] sm:max-w-[240px]">
            {invoice.fileName}
          </span>
          <span className="text-[10px] text-slate-400 bg-[#243B5A] px-1.5 py-0.5 rounded">
            PDF Document
          </span>
        </div>

        {/* Zoom & Page Controls */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleZoomOut}
            className="p-1 hover:bg-[#243B5A] rounded text-slate-300 hover:text-white"
            title="Zoom Out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleResetZoom}
            className="px-1.5 py-0.5 hover:bg-[#243B5A] rounded font-mono text-[11px] text-slate-300 hover:text-white tabular-nums"
          >
            {zoomLevel}%
          </button>
          <button
            onClick={handleZoomIn}
            className="p-1 hover:bg-[#243B5A] rounded text-slate-300 hover:text-white"
            title="Zoom In"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>

          <div className="h-3.5 w-px bg-[#243B5A] mx-1" />

          <button
            onClick={handleDownloadDoc}
            className="p-1 hover:bg-[#243B5A] rounded text-slate-300 hover:text-white"
            title="Download Original Document Transcript"
          >
            <Download className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Backend mode: the real stored PDF (served only for a known document record) */}
      {IS_BACKEND && (
        <div className="flex-1 bg-[#1E293B] min-h-[600px]">
          {invoice.documentId && backendService ? (
            <object
              data={backendService.documentFileUrl(invoice.documentId)}
              type="application/pdf"
              className="w-full h-full min-h-[600px]"
              aria-label={`PDF: ${invoice.fileName}`}
            >
              <div className="p-6 text-xs text-slate-300">
                Your browser cannot display the PDF inline.{' '}
                <a className="underline text-white" href={backendService.documentFileUrl(invoice.documentId)} target="_blank" rel="noreferrer">
                  Open it in a new tab
                </a>
                .
              </div>
            </object>
          ) : (
            <div className="p-6 text-xs text-slate-300">This invoice was entered manually and has no source PDF.</div>
          )}
        </div>
      )}

      {/* Main Preview Container (demo mode: simulated sheet) */}
      <div className={`flex-1 p-4 overflow-auto flex items-start justify-center bg-[#1E293B] ${IS_BACKEND ? 'hidden' : ''}`}>
        {/* Simulated Document Sheet matching High-Fidelity Enterprise Invoice */}
        <div
          style={{
            transform: `scale(${zoomLevel / 100})`,
            transformOrigin: 'top center',
            transition: 'transform 0.15s ease-out',
          }}
          className="w-full max-w-[620px] bg-white text-[#172B4D] rounded-xs shadow-2xl p-7 border border-slate-300 min-h-[780px] flex flex-col justify-between font-sans text-xs"
        >
          <div>
            {/* Header / Vendor Brand */}
            <div className="flex items-start justify-between pb-6 border-b border-slate-200">
              <div>
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded bg-[#172B4D] text-white flex items-center justify-center font-bold text-xs">
                    {invoice.vendorName ? invoice.vendorName.charAt(0) : 'V'}
                  </div>
                  <div>
                    <h2 className="text-base font-bold tracking-tight text-[#172B4D]">
                      {invoice.vendorName || 'ACME CORPORATION'}
                    </h2>
                    <p className="text-[10px] text-slate-500 font-medium">Verified Accounts Payable Partner</p>
                  </div>
                </div>
                <div className="mt-3 text-[11px] text-slate-600 space-y-0.5 leading-tight">
                  <p>{invoice.vendorAddress || '123 Innovation Drive, San Francisco, CA'}</p>
                  {invoice.vendorTaxId && <p>Tax / EIN: {invoice.vendorTaxId}</p>}
                  {invoice.vendorEmail && <p>Email: {invoice.vendorEmail}</p>}
                </div>
              </div>

              <div className="text-right">
                <h1 className="text-xl font-extrabold text-[#172B4D] tracking-wide uppercase">
                  INVOICE
                </h1>
                <div className="mt-3 text-[11px] space-y-1">
                  <div>
                    <span className="text-slate-500 mr-2">Invoice #:</span>
                    <span className="font-mono font-bold text-[#172B4D]">
                      {invoice.invoiceNumber || 'INV-84291'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 mr-2">Invoice Date:</span>
                    <span className="font-medium text-[#172B4D]">
                      {formatDate(invoice.invoiceDate, 'MMM DD, YYYY')}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 mr-2">Due Date:</span>
                    <span className="font-medium text-[#172B4D]">
                      {formatDate(invoice.dueDate, 'MMM DD, YYYY')}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Bill To & Ship To Sections */}
            <div className="grid grid-cols-2 gap-4 py-5 border-b border-slate-200 text-[11px]">
              <div>
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                  Bill To
                </span>
                <p className="font-bold text-[#172B4D]">{invoice.customerName || 'Globex Industries Inc.'}</p>
                <p className="text-slate-600 mt-0.5">{invoice.customerAddress}</p>
                <p className="text-slate-500 text-[10px] mt-0.5">Tax ID: {invoice.customerTaxId}</p>
              </div>

              <div>
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                  Payment Reference
                </span>
                <p className="font-medium text-[#172B4D]">{invoice.paymentTerms || 'Net 30 Days'}</p>
                <p className="font-mono text-slate-600 text-[10px] mt-0.5">
                  Ref: {invoice.paymentReference || 'WIRE-PENDING'}
                </p>
                <p className="text-[10px] text-slate-500 mt-0.5">Currency: {invoice.currency || 'USD'}</p>
              </div>
            </div>

            {/* Line Items Table */}
            <div className="mt-4">
              <table className="w-full text-left text-[11px]">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-300">
                    <th className="py-2 px-2.5">Description</th>
                    <th className="py-2 px-2 text-right">Qty</th>
                    <th className="py-2 px-2 text-right">Unit Price</th>
                    <th className="py-2 px-2.5 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {invoice.lineItems.map((item, idx) => (
                    <tr key={item.id || idx}>
                      <td className="py-2 px-2.5 font-medium text-[#172B4D]">{item.description}</td>
                      <td className="py-2 px-2 text-right font-mono text-slate-700 tabular-nums">
                        {item.quantity}
                      </td>
                      <td className="py-2 px-2 text-right font-mono text-slate-700 tabular-nums">
                        {formatCurrency(item.unitPrice, invoice.currency)}
                      </td>
                      <td className="py-2 px-2.5 text-right font-mono font-semibold text-[#172B4D] tabular-nums">
                        {formatCurrency(item.lineTotal, invoice.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Footer Totals */}
          <div className="pt-6 border-t border-slate-200 mt-6">
            <div className="flex justify-end">
              <div className="w-56 space-y-1.5 text-[11px]">
                <div className="flex justify-between text-slate-600">
                  <span>Subtotal:</span>
                  <span className="font-mono font-medium tabular-nums">
                    {formatCurrency(invoice.subtotal, invoice.currency)}
                  </span>
                </div>
                {invoice.taxAmount > 0 && (
                  <div className="flex justify-between text-slate-600">
                    <span>Tax:</span>
                    <span className="font-mono font-medium tabular-nums">
                      {formatCurrency(invoice.taxAmount, invoice.currency)}
                    </span>
                  </div>
                )}
                {invoice.discount > 0 && (
                  <div className="flex justify-between text-slate-600">
                    <span>Discount:</span>
                    <span className="font-mono text-[#16865C] tabular-nums">
                      -{formatCurrency(invoice.discount, invoice.currency)}
                    </span>
                  </div>
                )}
                {invoice.shippingCharges > 0 && (
                  <div className="flex justify-between text-slate-600">
                    <span>Shipping:</span>
                    <span className="font-mono font-medium tabular-nums">
                      {formatCurrency(invoice.shippingCharges, invoice.currency)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between text-xs font-bold text-[#172B4D] pt-2 border-t border-slate-300">
                  <span>Total Due:</span>
                  <span className="font-mono tabular-nums">
                    {formatCurrency(invoice.grandTotal, invoice.currency)}
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-8 pt-3 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400">
              <span>Electronic Remittance Advice · INVOXIS Document OCR</span>
              <span>Page 1 of {totalPages}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Page Navigation Bottom Bar */}
      <div className="h-10 bg-[#0F1D33] px-4 border-t border-[#243B5A] flex items-center justify-center gap-3 text-xs shrink-0">
        <button
          onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
          disabled={currentPage === 1}
          className="p-1 rounded text-slate-400 hover:text-white disabled:opacity-30"
          aria-label="Previous Page"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="font-mono text-[11px] text-slate-300 tabular-nums">
          {currentPage} / {totalPages}
        </span>
        <button
          onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
          disabled={currentPage === totalPages}
          className="p-1 rounded text-slate-400 hover:text-white disabled:opacity-30"
          aria-label="Next Page"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
