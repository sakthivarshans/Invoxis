import React from 'react';
import { UploadDropzone } from '../components/documents/UploadDropzone';
import { DocumentQueueTable } from '../components/documents/DocumentQueueTable';
import { ShieldCheck, Cpu, ArrowUpRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export const DocumentsPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[#172B4D] tracking-tight">
            Document Intake & Queue
          </h1>
          <p className="text-xs text-[#697586] mt-0.5">
            Ingest, manage, and monitor batch optical recognition across accounts payable invoices
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/validation')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#172B4D] bg-white border border-[#E3E8F0] hover:bg-[#F7F9FC] rounded-lg transition-colors shadow-xs"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-[#16865C]" />
            Validation Rules
          </button>
        </div>
      </div>

      {/* Intake Dropzone */}
      <UploadDropzone />

      {/* Document Queue Table */}
      <DocumentQueueTable />
    </div>
  );
};
