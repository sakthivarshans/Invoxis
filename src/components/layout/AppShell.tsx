import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { AlertCircle, ServerCrash } from 'lucide-react';
import { useInvoices } from '../../context/InvoiceContext';
import { IS_BACKEND } from '../../config';

export const AppShell: React.FC = () => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const { loadError, refresh } = useInvoices();

  return (
    <div className="min-h-screen bg-[#F7F9FC] flex">
      {/* Sidebar */}
      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <Header onOpenSidebar={() => setIsSidebarOpen(true)} />

        {/* Mode banner */}
        {IS_BACKEND ? (
          <div className="bg-[#ECFDF3] border-b border-[#A6F4C5] px-4 py-1.5 flex items-center justify-between text-xs text-[#0E6243]">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 text-[#16865C]" />
              <span className="font-medium">
                Backend Mode: persistent data, server-side Groq extraction and deterministic validation.
              </span>
            </div>
            <span className="hidden sm:inline-block text-[11px] bg-white px-2 py-0.5 rounded border border-[#A6F4C5]">
              FastAPI Connected
            </span>
          </div>
        ) : (
          <div className="bg-[#EFF8FF] border-b border-[#B2DDFF] px-4 py-1.5 flex items-center justify-between text-xs text-[#175CD3]">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 text-[#356AE6]" />
              <span className="font-medium">
                Demo Mode: Frontend prototype with simulated AI document extraction and deterministic validation rules.
              </span>
            </div>
            <span className="hidden sm:inline-block text-[11px] bg-white text-[#175CD3] px-2 py-0.5 rounded border border-[#B2DDFF]">
              FastAPI Connector Ready
            </span>
          </div>
        )}

        {/* Backend failure banner: real errors are shown, never masked by mock data */}
        {IS_BACKEND && loadError && (
          <div role="alert" className="bg-[#FEF3F2] border-b border-[#FECDCA] px-4 py-2 flex items-center justify-between gap-3 text-xs text-[#B42318]">
            <div className="flex items-center gap-2 min-w-0">
              <ServerCrash className="w-4 h-4 shrink-0" />
              <span className="font-medium">
                Could not sync with the backend: {loadError} Data shown may be out of date.
              </span>
            </div>
            <button
              onClick={() => void refresh()}
              className="shrink-0 px-2.5 py-1 font-semibold bg-white border border-[#FECDCA] rounded-md hover:bg-[#FEF3F2]"
            >
              Retry
            </button>
          </div>
        )}

        {/* Dynamic Page Router Outlet */}
        <main className="flex-1 p-4 lg:p-6 overflow-x-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
