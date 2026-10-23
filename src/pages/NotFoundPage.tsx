import React from 'react';
import { useNavigate } from 'react-router-dom';
import { FileQuestion, ArrowLeft } from 'lucide-react';

export const NotFoundPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-center p-6 bg-white rounded-lg border border-[#E3E8F0]">
      <div className="w-12 h-12 rounded-full bg-[#EFF8FF] text-[#356AE6] flex items-center justify-center mb-4">
        <FileQuestion className="w-6 h-6" />
      </div>
      <h1 className="text-lg font-bold text-[#172B4D]">Page Not Found</h1>
      <p className="text-xs text-[#697586] mt-1 max-w-sm">
        The requested financial module or invoice record could not be found.
      </p>
      <button
        onClick={() => navigate('/dashboard')}
        className="mt-5 flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#356AE6] hover:bg-[#2955BF] rounded-lg transition-colors shadow-xs"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Return to Overview Dashboard
      </button>
    </div>
  );
};
