import React, { useCallback, useEffect, useState } from 'react';
import { Cpu, Cloud, Database, Server, RefreshCw } from 'lucide-react';
import { backendService } from '../../services/invoiceService';
import { describeError } from '../../services/api/httpClient';
import { HealthDto } from '../../services/api/dto';
import { API_BASE_URL } from '../../config';

/** Live /health data (backend mode only). Shows exactly what the server reports; nothing is simulated. */
export const BackendHealthPanel: React.FC = () => {
  const [health, setHealth] = useState<HealthDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!backendService) return;
    setLoading(true);
    try {
      setHealth(await backendService.health());
      setError(null);
    } catch (e) {
      setHealth(null);
      setError(describeError(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const ok = (v: boolean) =>
    v
      ? 'text-[#16865C] bg-[#ECFDF3] border-[#A6F4C5]'
      : 'text-[#B42318] bg-[#FEF3F2] border-[#FECDCA]';

  const Card = ({ icon, title, good, label, children }: { icon: React.ReactNode; title: string; good: boolean; label: string; children: React.ReactNode }) => (
    <div className="p-4 rounded-lg bg-white border border-[#E3E8F0] flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-[#172B4D] flex items-center gap-1.5">{icon}{title}</span>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${ok(good)}`}>{label}</span>
        </div>
        <p className="text-xs text-[#697586]">{children}</p>
      </div>
    </div>
  );

  return (
    <div className="bg-white rounded-lg border border-[#E3E8F0] p-6">
      <div className="border-b border-[#E3E8F0] pb-3 mb-4 flex items-start justify-between">
        <div>
          <h2 className="text-sm font-semibold text-[#172B4D]">Architecture &amp; Service Health</h2>
          <p className="text-xs text-[#697586]">Live status reported by {API_BASE_URL}/health</p>
        </div>
        <button onClick={() => void load()} disabled={loading} className="flex items-center gap-1.5 px-2.5 py-1 text-xs border border-[#E3E8F0] rounded-md hover:bg-[#F7F9FC] disabled:opacity-50">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {error && (
        <div role="alert" className="mb-4 text-xs text-[#B42318] bg-[#FEF3F2] border border-[#FECDCA] rounded-lg px-4 py-2.5">
          Backend unreachable: {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card icon={<Server className="w-4 h-4 text-[#16865C]" />} title="Frontend SPA" good label="OPERATIONAL">
          Running in backend mode against {API_BASE_URL}.
        </Card>
        <Card icon={<Cpu className="w-4 h-4 text-[#356AE6]" />} title="FastAPI Backend" good={health?.status === 'ok'} label={health ? health.status.toUpperCase() : 'UNREACHABLE'}>
          {health ? `Environment: ${health.environment}.` : 'No response from the API.'}
        </Card>
        <Card icon={<Database className="w-4 h-4 text-[#697586]" />} title="Database" good={health?.database === 'connected'} label={health ? health.database.toUpperCase() : 'UNKNOWN'}>
          Persistent invoice, audit and workflow storage.
        </Card>
        <Card icon={<Cloud className="w-4 h-4 text-[#356AE6]" />} title="Groq Extraction" good={Boolean(health?.extraction.configured)} label={health?.extraction.configured ? 'CONFIGURED' : 'NOT CONFIGURED'}>
          {health?.extraction.configured
            ? `Text model: ${health.extraction.model}. Scanned pages: ${health.extraction.vision_model}.`
            : 'Set GROQ_API_KEY and GROQ_MODEL in backend/.env and restart. Uploads are still stored; extraction fails with a clear error until configured.'}
        </Card>
      </div>
    </div>
  );
};
