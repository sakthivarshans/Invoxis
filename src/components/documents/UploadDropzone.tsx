import React, { useState, useRef } from 'react';
import { UploadCloud, FileText, CheckCircle2, AlertCircle, Trash2, Loader2, Sparkles } from 'lucide-react';
import { formatFileSize } from '../../utils/currency';
import { useInvoices } from '../../context/InvoiceContext';
import { useToast } from '../../context/ToastContext';
import { Invoice } from '../../types/invoice';
import { IS_BACKEND } from '../../config';
import { describeError } from '../../services/api/httpClient';

interface StagedFile {
  id: string;
  file: File;
  name: string;
  size: number;
  progress: number;
  status: 'ready' | 'processing' | 'completed' | 'error';
  errorMessage?: string;
}

export const UploadDropzone: React.FC = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [stagedFiles, setStagedFiles] = useState<StagedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessingBatch, setIsProcessingBatch] = useState(false);

  const { addNewInvoice, uploadDocuments } = useInvoices();
  const toast = useToast();

  const handleFilesSelected = (files: FileList | File[]) => {
    const validPdfFiles: StagedFile[] = [];
    const invalidNames: string[] = [];

    Array.from(files).forEach((file) => {
      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
      if (isPdf) {
        validPdfFiles.push({
          id: `staged-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          file,
          name: file.name,
          size: file.size,
          progress: 0,
          status: 'ready',
        });
      } else {
        invalidNames.push(file.name);
      }
    });

    if (invalidNames.length > 0) {
      toast.error(
        'Unsupported file format',
        `Only PDF files are supported. Rejected: ${invalidNames.join(', ')}`
      );
    }

    if (validPdfFiles.length > 0) {
      setStagedFiles((prev) => [...prev, ...validPdfFiles]);
      toast.info('PDF added to upload queue', `${validPdfFiles.length} file(s) ready for intake`);
    }
  };

  const removeStagedFile = (id: string) => {
    setStagedFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const handleProcessUploads = async () => {
    if (stagedFiles.length === 0 || isProcessingBatch) return;

    setIsProcessingBatch(true);

    if (IS_BACKEND) {
      // Real upload: the server validates + stores each PDF and extracts it in the background.
      setStagedFiles((prev) => prev.map((f) => ({ ...f, status: 'processing', progress: 50 })));
      try {
        const outcomes = await uploadDocuments(stagedFiles.map((f) => f.file));
        const byName = new Map(outcomes.map((o) => [o.filename, o]));
        setStagedFiles((prev) =>
          prev.map((f) => {
            const o = byName.get(f.name);
            return o && !o.accepted
              ? { ...f, status: 'error', progress: 0, errorMessage: o.errorMessage }
              : { ...f, status: 'completed', progress: 100 };
          })
        );
        const ok = outcomes.filter((o) => o.accepted);
        const failedNow = ok.filter((o) => o.status === 'failed');
        const rejected = outcomes.filter((o) => !o.accepted);
        if (ok.length > 0 && failedNow.length === 0) {
          toast.success('Upload accepted', `${ok.length} PDF(s) stored. Extraction is running; status updates below.`);
        }
        failedNow.forEach((o) => toast.error(`Extraction not started: ${o.filename}`, o.errorMessage || 'Unknown error'));
        rejected.forEach((o) => toast.error(`Rejected: ${o.filename}`, o.errorMessage || 'Upload rejected'));
        // Keep rejected files visible (with their reason); clear accepted ones shortly after.
        setTimeout(() => setStagedFiles((prev) => prev.filter((f) => f.status === 'error')), 1800);
      } catch (err) {
        // guard() already toasted the exact server error; keep files staged so the user can retry.
        setStagedFiles((prev) => prev.map((f) => ({ ...f, status: 'ready', progress: 0 })));
        console.error(describeError(err));
      } finally {
        setIsProcessingBatch(false);
      }
      return;
    }

    // Demo mode: process files sequentially with simulated progress stages
    for (let i = 0; i < stagedFiles.length; i++) {
      const current = stagedFiles[i];

      // Update state to processing
      setStagedFiles((prev) =>
        prev.map((f, idx) => (idx === i ? { ...f, status: 'processing', progress: 15 } : f))
      );

      // Simulate OCR stage
      await new Promise((r) => setTimeout(r, 600));
      setStagedFiles((prev) =>
        prev.map((f, idx) => (idx === i ? { ...f, progress: 45 } : f))
      );

      // Simulate AI extraction stage
      await new Promise((r) => setTimeout(r, 700));
      setStagedFiles((prev) =>
        prev.map((f, idx) => (idx === i ? { ...f, progress: 85 } : f))
      );

      // Finish and construct mock extracted invoice object
      await new Promise((r) => setTimeout(r, 500));

      const invNumber = `INV-${Math.floor(10000 + Math.random() * 90000)}`;
      const vendorOptions = [
        'Apex Solutions Group',
        'Cortex Cloud Robotics',
        'Vanguard Consulting Inc',
        'Meridian Logistics Network',
      ];
      const randomVendor = vendorOptions[Math.floor(Math.random() * vendorOptions.length)];
      const randomSubtotal = Math.floor(2500 + Math.random() * 15000);
      const taxRate = 8.5;
      const taxAmount = Math.round(randomSubtotal * 0.085 * 100) / 100;
      const grandTotal = Math.round((randomSubtotal + taxAmount) * 100) / 100;

      const newInvoice: Invoice = {
        id: `inv-${Date.now()}`,
        fileName: current.name,
        fileSize: current.size || 215000,
        uploadDate: new Date().toISOString(),
        processingStatus: 'completed',
        validationStatus: 'valid',
        reviewStatus: 'pending',
        overallConfidence: Math.floor(940 + Math.random() * 55) / 10,
        invoiceNumber: invNumber,
        invoiceDate: new Date().toISOString().split('T')[0],
        dueDate: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
        vendorName: randomVendor,
        vendorAddress: '100 Innovation Way, Suite 300',
        vendorTaxId: `US-94-${Math.floor(1000000 + Math.random() * 9000000)}`,
        customerName: 'Globex Industries Inc.',
        customerAddress: '456 Enterprise Way, Suite 400, New York, NY 10001',
        customerTaxId: 'US-13-9821445',
        currency: 'USD',
        subtotal: randomSubtotal,
        taxAmount: taxAmount,
        discount: 0,
        shippingCharges: 0,
        grandTotal: grandTotal,
        paymentTerms: 'Net 30',
        paymentReference: `EFT-${invNumber}`,
        lineItems: [
          {
            id: `li-${Date.now()}-1`,
            description: 'Professional Engineering Services',
            quantity: 1,
            unitPrice: randomSubtotal,
            discount: 0,
            taxRate: taxRate,
            lineTotal: randomSubtotal,
          },
        ],
        reviewHistory: [],
        pageCount: 1,
        lastUpdated: new Date().toISOString(),
      };

      await addNewInvoice(newInvoice);

      setStagedFiles((prev) =>
        prev.map((f, idx) => (idx === i ? { ...f, status: 'completed', progress: 100 } : f))
      );
    }

    setIsProcessingBatch(false);
    toast.success(
      'Intake processing completed',
      `${stagedFiles.length} PDF(s) processed and parsed into invoice register.`
    );
    // Clear completed staged files after a short delay
    setTimeout(() => {
      setStagedFiles([]);
    }, 1800);
  };

  return (
    <div className="bg-white rounded-lg border border-[#E3E8F0] p-5">
      <div className="flex items-center justify-between pb-3 border-b border-[#E3E8F0]">
        <div>
          <h2 className="text-sm font-semibold text-[#172B4D]">Document Intake Engine</h2>
          <p className="text-xs text-[#697586]">
            Upload vendor invoices in PDF format for multi-layer layout extraction
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-medium text-[#356AE6] bg-[#EFF8FF] px-2.5 py-1 rounded-md border border-[#B2DDFF]">
            {IS_BACKEND ? 'Backend mode: server-side Groq extraction' : 'Demo mode: simulated processing'}
          </span>
        </div>
      </div>

      {/* Drag & Drop Area */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          if (e.dataTransfer.files) {
            handleFilesSelected(e.dataTransfer.files);
          }
        }}
        onClick={() => fileInputRef.current?.click()}
        className={`mt-4 border-2 border-dashed rounded-lg p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-colors ${
          isDragging
            ? 'border-[#356AE6] bg-[#F2F6FF]'
            : 'border-[#E3E8F0] hover:border-[#356AE6]/70 hover:bg-[#F8F9FA]'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf,.pdf"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) {
              handleFilesSelected(e.target.files);
              e.target.value = '';
            }
          }}
        />

        <div className="w-12 h-12 rounded-full bg-[#EFF8FF] text-[#356AE6] flex items-center justify-center mb-3">
          <UploadCloud className="w-6 h-6" />
        </div>

        <p className="text-xs font-semibold text-[#172B4D]">
          Click to upload or drag & drop invoice PDFs
        </p>
        <p className="text-[11px] text-[#697586] mt-1">
          Supports single or batch PDF uploads (MIME application/pdf, max 25MB each)
        </p>

        <div className="mt-4 flex items-center gap-2 text-[11px] text-[#697586]">
          <span className="inline-flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-[#356AE6]" />
            OCR Layout Segmentation
          </span>
          <span>·</span>
          <span>{IS_BACKEND ? 'FastAPI + Groq' : 'FastAPI Mock Engine'}</span>
        </div>
      </div>

      {/* Staged Files Queue */}
      {stagedFiles.length > 0 && (
        <div className="mt-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#172B4D]">
              Ready to Process ({stagedFiles.length} files)
            </span>
            <button
              onClick={() => setStagedFiles([])}
              disabled={isProcessingBatch}
              className="text-xs text-[#D64545] hover:underline disabled:opacity-50"
            >
              Clear queue
            </button>
          </div>

          <div className="space-y-2">
            {stagedFiles.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between p-3 rounded-md bg-[#F8F9FA] border border-[#E3E8F0] text-xs"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <FileText className="w-4 h-4 text-[#356AE6] shrink-0" />
                  <div className="min-w-0">
                    <p className="font-medium text-[#172B4D] truncate">{item.name}</p>
                    <p className="text-[11px] text-[#697586]">{formatFileSize(item.size)}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {item.status === 'processing' && (
                    <div className="flex items-center gap-2 text-[#356AE6]">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span className="text-[11px] font-mono">{item.progress}%</span>
                    </div>
                  )}

                  {item.status === 'error' && (
                    <span className="flex items-center gap-1 text-[#D64545] font-medium text-[11px] max-w-[260px]" title={item.errorMessage}>
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span className="truncate">{item.errorMessage || 'Rejected'}</span>
                    </span>
                  )}

                  {item.status === 'completed' && (
                    <span className="flex items-center gap-1 text-[#16865C] font-medium text-[11px]">
                      <CheckCircle2 className="w-4 h-4" />
                      Completed
                    </span>
                  )}

                  {(item.status === 'ready' || item.status === 'error') && !isProcessingBatch && (
                    <button
                      onClick={() => removeStagedFile(item.id)}
                      className="text-[#697586] hover:text-[#D64545] p-1"
                      aria-label="Remove file"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-end pt-2">
            <button
              onClick={handleProcessUploads}
              disabled={isProcessingBatch}
              className="flex items-center gap-2 px-4 py-2 bg-[#356AE6] hover:bg-[#2955BF] text-white text-xs font-semibold rounded-lg transition-colors shadow-xs disabled:opacity-60"
            >
              {isProcessingBatch ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Processing Invoices...
                </>
              ) : (
                <>
                  <UploadCloud className="w-4 h-4" />
                  Upload & Process ({stagedFiles.length})
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
