import React, { useState } from 'react';
import {
  Settings,
  Sliders,
  ShieldCheck,
  History,
  Activity,
  Save,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Server,
  Cpu,
  Database,
  Cloud,
  Layers,
  Search,
} from 'lucide-react';
import { useInvoices } from '../context/InvoiceContext';
import { useToast } from '../context/ToastContext';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { formatDateTime } from '../utils/dates';
import { IS_BACKEND } from '../config';
import { BackendHealthPanel } from '../components/settings/BackendHealthPanel';

export const SettingsPage: React.FC = () => {
  const { settings, updateAppSettings, auditLogs, resetToDefaults } = useInvoices();
  const toast = useToast();

  const [activeTab, setActiveTab] = useState<
    'general' | 'extraction' | 'validation' | 'audit' | 'system'
  >('general');

  // Local form state for settings
  const [formData, setFormData] = useState(settings);
  const [isResetDialogOpen, setIsResetDialogOpen] = useState(false);

  // Audit filter state
  const [auditSearch, setAuditSearch] = useState('');
  const [auditCategory, setAuditCategory] = useState('all');

  const handleSaveSettings = () => {
    updateAppSettings(formData);
    toast.success('Settings Saved', 'Configuration preferences saved to local workspace.');
  };

  const handleConfirmReset = async () => {
    await resetToDefaults();
    setFormData(settings);
    setIsResetDialogOpen(false);
    toast.success('Workspace Reset', 'Demo invoices, audit logs, and settings restored to initial state.');
  };

  const filteredAuditLogs = auditLogs.filter((log) => {
    const matchesSearch =
      log.action.toLowerCase().includes(auditSearch.toLowerCase()) ||
      log.description.toLowerCase().includes(auditSearch.toLowerCase()) ||
      (log.invoiceNumber && log.invoiceNumber.toLowerCase().includes(auditSearch.toLowerCase())) ||
      log.actor.toLowerCase().includes(auditSearch.toLowerCase());

    const matchesCategory =
      auditCategory === 'all' || log.category === auditCategory;

    return matchesSearch && matchesCategory;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[#172B4D] tracking-tight">
            Settings & Audit Control
          </h1>
          <p className="text-xs text-[#697586] mt-0.5">
            Configure financial rules, extraction thresholds, review governance, and system telemetry
          </p>
        </div>

        <div className="flex items-center gap-2">
          {!IS_BACKEND && (
          <button
            onClick={() => setIsResetDialogOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#D64545] bg-[#FEF3F2] hover:bg-[#FECDCA] rounded-lg transition-colors border border-[#FECDCA]"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset Demo Data
          </button>
          )}
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex items-center gap-1 bg-white p-1 rounded-lg border border-[#E3E8F0] overflow-x-auto">
        <button
          onClick={() => setActiveTab('general')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-md text-xs font-medium transition-all whitespace-nowrap ${
            activeTab === 'general'
              ? 'bg-[#172B4D] text-white shadow-xs'
              : 'text-[#697586] hover:text-[#172B4D] hover:bg-[#F2F6FF]'
          }`}
        >
          <Settings className="w-3.5 h-3.5" />
          General
        </button>

        <button
          onClick={() => setActiveTab('extraction')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-md text-xs font-medium transition-all whitespace-nowrap ${
            activeTab === 'extraction'
              ? 'bg-[#172B4D] text-white shadow-xs'
              : 'text-[#697586] hover:text-[#172B4D] hover:bg-[#F2F6FF]'
          }`}
        >
          <Sliders className="w-3.5 h-3.5" />
          Extraction
        </button>

        <button
          onClick={() => setActiveTab('validation')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-md text-xs font-medium transition-all whitespace-nowrap ${
            activeTab === 'validation'
              ? 'bg-[#172B4D] text-white shadow-xs'
              : 'text-[#697586] hover:text-[#172B4D] hover:bg-[#F2F6FF]'
          }`}
        >
          <ShieldCheck className="w-3.5 h-3.5" />
          Validation Rules
        </button>

        <button
          onClick={() => setActiveTab('audit')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-md text-xs font-medium transition-all whitespace-nowrap ${
            activeTab === 'audit'
              ? 'bg-[#172B4D] text-white shadow-xs'
              : 'text-[#697586] hover:text-[#172B4D] hover:bg-[#F2F6FF]'
          }`}
        >
          <History className="w-3.5 h-3.5" />
          Audit Trail ({auditLogs.length})
        </button>

        <button
          onClick={() => setActiveTab('system')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-md text-xs font-medium transition-all whitespace-nowrap ${
            activeTab === 'system'
              ? 'bg-[#172B4D] text-white shadow-xs'
              : 'text-[#697586] hover:text-[#172B4D] hover:bg-[#F2F6FF]'
          }`}
        >
          <Activity className="w-3.5 h-3.5" />
          System Health
        </button>
      </div>

      {/* Tab 1: General Settings */}
      {activeTab === 'general' && (
        <div className="bg-white rounded-lg border border-[#E3E8F0] p-6 space-y-6">
          <div className="border-b border-[#E3E8F0] pb-3">
            <h2 className="text-sm font-semibold text-[#172B4D]">Workspace Settings</h2>
            <p className="text-xs text-[#697586]">
              Localization, default currencies, and ledger display preferences
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl">
            <div>
              <label className="text-xs font-medium text-[#172B4D] block mb-1">
                Workspace / Organization Name
              </label>
              <input
                type="text"
                value={formData.workspaceName}
                onChange={(e) => setFormData({ ...formData, workspaceName: e.target.value })}
                className="w-full px-3 py-2 bg-[#F8F9FA] border border-[#E3E8F0] focus:border-[#356AE6] rounded-md text-xs text-[#172B4D] focus:outline-hidden"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-[#172B4D] block mb-1">
                Default Currency
              </label>
              <select
                value={formData.defaultCurrency}
                onChange={(e) => setFormData({ ...formData, defaultCurrency: e.target.value })}
                className="w-full px-3 py-2 bg-[#F8F9FA] border border-[#E3E8F0] focus:border-[#356AE6] rounded-md text-xs text-[#172B4D] focus:outline-hidden"
              >
                <option value="USD">USD ($ - US Dollar)</option>
                <option value="EUR">EUR (€ - Euro)</option>
                <option value="GBP">GBP (£ - British Pound)</option>
                <option value="CAD">CAD (CA$ - Canadian Dollar)</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-[#172B4D] block mb-1">
                Date Display Format
              </label>
              <select
                value={formData.dateFormat}
                onChange={(e) => setFormData({ ...formData, dateFormat: e.target.value })}
                className="w-full px-3 py-2 bg-[#F8F9FA] border border-[#E3E8F0] focus:border-[#356AE6] rounded-md text-xs text-[#172B4D] focus:outline-hidden"
              >
                <option value="YYYY-MM-DD">YYYY-MM-DD (ISO 8601)</option>
                <option value="MM/DD/YYYY">MM/DD/YYYY (US Standard)</option>
                <option value="DD/MM/YYYY">DD/MM/YYYY (International)</option>
                <option value="MMM DD, YYYY">MMM DD, YYYY (Formal)</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-[#172B4D] block mb-1">
                Default Table Page Size
              </label>
              <select
                value={formData.pageSize}
                onChange={(e) => setFormData({ ...formData, pageSize: Number(e.target.value) })}
                className="w-full px-3 py-2 bg-[#F8F9FA] border border-[#E3E8F0] focus:border-[#356AE6] rounded-md text-xs text-[#172B4D] focus:outline-hidden"
              >
                <option value={10}>10 records per page</option>
                <option value={20}>20 records per page</option>
                <option value={50}>50 records per page</option>
              </select>
            </div>
          </div>

          <div className="pt-4 border-t border-[#E3E8F0] flex justify-start">
            <button
              onClick={handleSaveSettings}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#356AE6] hover:bg-[#2955BF] rounded-lg transition-colors shadow-xs"
            >
              <Save className="w-3.5 h-3.5" />
              Save General Preferences
            </button>
          </div>
        </div>
      )}

      {/* Tab 2: Extraction Settings */}
      {activeTab === 'extraction' && (
        <div className="bg-white rounded-lg border border-[#E3E8F0] p-6 space-y-6">
          <div className="border-b border-[#E3E8F0] pb-3">
            <h2 className="text-sm font-semibold text-[#172B4D]">AI Extraction Parameters</h2>
            <p className="text-xs text-[#697586]">
              Tune OCR confidence boundaries and straight-through processing policies (Frontend Prototype Mode)
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl">
            <div>
              <label className="text-xs font-medium text-[#172B4D] block mb-1">
                Supported Ingestion Format
              </label>
              <input
                type="text"
                disabled
                value="PDF (application/pdf)"
                className="w-full px-3 py-2 bg-slate-100 border border-[#E3E8F0] text-xs text-slate-500 rounded-md font-mono"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-[#172B4D] block mb-1">
                Confidence Review Threshold (%)
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min="70"
                  max="99"
                  value={formData.confidenceThreshold}
                  onChange={(e) =>
                    setFormData({ ...formData, confidenceThreshold: Number(e.target.value) })
                  }
                  className="flex-1"
                />
                <span className="font-mono text-xs font-bold text-[#172B4D] w-12 text-right">
                  {formData.confidenceThreshold}%
                </span>
              </div>
              <p className="text-[11px] text-[#697586] mt-1">
                Invoices with confidence below this threshold automatically flag for manual review.
              </p>
            </div>
          </div>

          <div className="pt-4 border-t border-[#E3E8F0] flex justify-start">
            <button
              onClick={handleSaveSettings}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#356AE6] hover:bg-[#2955BF] rounded-lg transition-colors shadow-xs"
            >
              <Save className="w-3.5 h-3.5" />
              Save Extraction Preferences
            </button>
          </div>
        </div>
      )}

      {/* Tab 3: Validation Rules */}
      {activeTab === 'validation' && (
        <div className="bg-white rounded-lg border border-[#E3E8F0] p-6 space-y-6">
          <div className="border-b border-[#E3E8F0] pb-3">
            <h2 className="text-sm font-semibold text-[#172B4D]">Financial Validation Rules Engine</h2>
            <p className="text-xs text-[#697586]">
              Configure rounding tolerances and duplicate prevention guards
            </p>
          </div>

          <div className="space-y-4 max-w-2xl">
            <div>
              <label className="text-xs font-medium text-[#172B4D] block mb-1">
                Currency Rounding Tolerance (in invoice currency)
              </label>
              <input
                type="number"
                step="0.01"
                min="0.00"
                max="1.00"
                value={formData.roundingTolerance}
                onChange={(e) =>
                  setFormData({ ...formData, roundingTolerance: parseFloat(e.target.value) || 0.02 })
                }
                className="w-48 px-3 py-2 bg-[#F8F9FA] border border-[#E3E8F0] focus:border-[#356AE6] rounded-md text-xs font-mono text-[#172B4D] focus:outline-hidden"
              />
              <p className="text-[11px] text-[#697586] mt-1">
                Allowed rounding difference between calculated line items and subtotal/grand total before triggering critical discrepancy (Default: ±0.02).
              </p>
            </div>

            <div className="pt-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.duplicateDetectionEnabled}
                  onChange={(e) =>
                    setFormData({ ...formData, duplicateDetectionEnabled: e.target.checked })
                  }
                  className="rounded text-[#356AE6] focus:ring-[#356AE6]"
                />
                <span className="text-xs font-semibold text-[#172B4D]">
                  Enable Cross-Vendor Duplicate Invoice Guard
                </span>
              </label>
              <p className="text-[11px] text-[#697586] ml-5 mt-0.5">
                Automatically scans for identical invoice numbers from the same vendor entity to mitigate duplicate disbursement risk.
              </p>
            </div>
          </div>

          <div className="pt-4 border-t border-[#E3E8F0] flex justify-start">
            <button
              onClick={handleSaveSettings}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#356AE6] hover:bg-[#2955BF] rounded-lg transition-colors shadow-xs"
            >
              <Save className="w-3.5 h-3.5" />
              Save Validation Engine Rules
            </button>
          </div>
        </div>
      )}

      {/* Tab 4: Audit Log */}
      {activeTab === 'audit' && (
        <div className="bg-white rounded-lg border border-[#E3E8F0] overflow-hidden">
          <div className="p-4 border-b border-[#E3E8F0] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-[#172B4D]">Operational Audit Trail</h2>
              <p className="text-xs text-[#697586]">
                Immutable log of document ingestion, field transcriptions, and compliance sign-offs
              </p>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex items-center bg-[#F7F9FC] border border-[#E3E8F0] focus-within:border-[#356AE6] rounded-md px-2.5 py-1.5 text-xs w-48">
                <Search className="w-3.5 h-3.5 text-[#697586] mr-1.5 shrink-0" />
                <input
                  type="text"
                  placeholder="Search audit trail..."
                  value={auditSearch}
                  onChange={(e) => setAuditSearch(e.target.value)}
                  className="w-full bg-transparent text-[#172B4D] placeholder-[#697586] focus:outline-hidden"
                />
              </div>

              <select
                value={auditCategory}
                onChange={(e) => setAuditCategory(e.target.value)}
                className="bg-[#F7F9FC] border border-[#E3E8F0] text-xs text-[#172B4D] rounded-md px-2 py-1.5 focus:outline-hidden"
              >
                <option value="all">All Categories</option>
                <option value="upload">Upload</option>
                <option value="extraction">Extraction</option>
                <option value="validation">Validation</option>
                <option value="review">Review</option>
                <option value="system">System</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-[#F8F9FA] text-[11px] font-semibold text-[#697586] uppercase tracking-wider border-b border-[#E3E8F0]">
                  <th className="py-2.5 px-4">Timestamp</th>
                  <th className="py-2.5 px-4">Action</th>
                  <th className="py-2.5 px-4">Invoice #</th>
                  <th className="py-2.5 px-4">Actor</th>
                  <th className="py-2.5 px-4">Category</th>
                  <th className="py-2.5 px-4">Description</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E3E8F0]">
                {filteredAuditLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-[#F2F6FF]/40 transition-colors">
                    <td className="py-2.5 px-4 font-mono text-[#697586] whitespace-nowrap">
                      {formatDateTime(log.timestamp)}
                    </td>
                    <td className="py-2.5 px-4 font-mono font-medium text-[#172B4D]">
                      {log.action}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-[#356AE6]">
                      {log.invoiceNumber || '—'}
                    </td>
                    <td className="py-2.5 px-4 text-[#172B4D] font-medium">{log.actor}</td>
                    <td className="py-2.5 px-4">
                      <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-[#F2F6FF] text-[#356AE6] border border-[#B2DDFF]">
                        {log.category}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-[#697586] max-w-md">{log.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 5: System Health */}
      {activeTab === 'system' && IS_BACKEND && <BackendHealthPanel />}

      {activeTab === 'system' && !IS_BACKEND && (
        <div className="space-y-6">
          <div className="bg-white rounded-lg border border-[#E3E8F0] p-6">
            <div className="border-b border-[#E3E8F0] pb-3 mb-4">
              <h2 className="text-sm font-semibold text-[#172B4D]">Architecture & Service Health</h2>
              <p className="text-xs text-[#697586]">
                Simulated service connector statuses. Live backend connectivity to be implemented via FastAPI.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Frontend */}
              <div className="p-4 rounded-lg bg-[#ECFDF3]/40 border border-[#A6F4C5] flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-[#172B4D] flex items-center gap-1.5">
                      <Server className="w-4 h-4 text-[#16865C]" />
                      Frontend SPA Application
                    </span>
                    <span className="text-[10px] font-bold text-[#16865C] bg-[#ECFDF3] px-2 py-0.5 rounded border border-[#A6F4C5]">
                      OPERATIONAL
                    </span>
                  </div>
                  <p className="text-xs text-[#697586]">
                    Vite 8 + React 19 + Tailwind CSS single page enterprise application with state persistence.
                  </p>
                </div>
                <div className="mt-3 pt-2 border-t border-[#A6F4C5]/60 text-[11px] text-[#16865C] font-mono">
                  Port: 3000 · Memory: OK
                </div>
              </div>

              {/* FastAPI Backend */}
              <div className="p-4 rounded-lg bg-[#FFFAEB]/40 border border-[#FEDF89] flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-[#172B4D] flex items-center gap-1.5">
                      <Cpu className="w-4 h-4 text-[#C98512]" />
                      Python FastAPI Backend
                    </span>
                    <span className="text-[10px] font-bold text-[#C98512] bg-[#FFFAEB] px-2 py-0.5 rounded border border-[#FEDF89]">
                      NOT CONNECTED
                    </span>
                  </div>
                  <p className="text-xs text-[#697586]">
                    Prepared for Claude Code integration. Service interfaces and TypeScript contracts defined.
                  </p>
                </div>
                <div className="mt-3 pt-2 border-t border-[#FEDF89]/60 text-[11px] text-[#C98512] font-mono">
                  Endpoint: /api/v1 (Mock fallback active)
                </div>
              </div>

              {/* AI Extraction Engine */}
              <div className="p-4 rounded-lg bg-[#EFF8FF] border border-[#B2DDFF] flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-[#172B4D] flex items-center gap-1.5">
                      <Cloud className="w-4 h-4 text-[#356AE6]" />
                      Groq Extraction Pipeline
                    </span>
                    <span className="text-[10px] font-bold text-[#356AE6] bg-white px-2 py-0.5 rounded border border-[#B2DDFF]">
                      SIMULATED CONNECTOR
                    </span>
                  </div>
                  <p className="text-xs text-[#697586]">
                    Deterministic mock extraction returns realistic field confidence scores and bounding coordinates.
                  </p>
                </div>
                <div className="mt-3 pt-2 border-t border-[#B2DDFF] text-[11px] text-[#356AE6] font-mono">
                  Model: set via GROQ_MODEL (Contract Ready)
                </div>
              </div>

              {/* Database */}
              <div className="p-4 rounded-lg bg-[#F8F9FA] border border-[#E3E8F0] flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-[#172B4D] flex items-center gap-1.5">
                      <Database className="w-4 h-4 text-[#697586]" />
                      PostgreSQL Database
                    </span>
                    <span className="text-[10px] font-bold text-[#697586] bg-white px-2 py-0.5 rounded border border-[#E3E8F0]">
                      NOT CONNECTED
                    </span>
                  </div>
                  <p className="text-xs text-[#697586]">
                    Database schemas and ORM migrations will be provisioned in the backend integration phase.
                  </p>
                </div>
                <div className="mt-3 pt-2 border-t border-[#E3E8F0] text-[11px] text-[#697586] font-mono">
                  Storage: Local Browser Storage active
                </div>
              </div>

              {/* Document Worker */}
              <div className="p-4 rounded-lg bg-[#F8F9FA] border border-[#E3E8F0] flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-[#172B4D] flex items-center gap-1.5">
                      <Layers className="w-4 h-4 text-[#697586]" />
                      Async Celery / Worker Queue
                    </span>
                    <span className="text-[10px] font-bold text-[#697586] bg-white px-2 py-0.5 rounded border border-[#E3E8F0]">
                      DEMO WORKER
                    </span>
                  </div>
                  <p className="text-xs text-[#697586]">
                    Client-side batch processing simulator handles concurrent PDF queuing and progress telemetry.
                  </p>
                </div>
                <div className="mt-3 pt-2 border-t border-[#E3E8F0] text-[11px] text-[#697586] font-mono">
                  Queue Latency: 0.0s (Direct state)
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reset Confirmation Dialog */}
      <ConfirmDialog
        isOpen={isResetDialogOpen}
        title="Reset All Workspace Demo Data"
        description="Are you sure you want to reset all mock invoices, manual edits, audit logs, and settings back to default values? Any changes you made will be cleared."
        confirmLabel="Reset to Initial Defaults"
        variant="danger"
        onConfirm={handleConfirmReset}
        onCancel={() => setIsResetDialogOpen(false)}
      />
    </div>
  );
};
