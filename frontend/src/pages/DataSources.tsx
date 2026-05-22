import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Database, Cloud, Server, Container, FileText, Send,
  Plus, X, CheckCircle, AlertCircle, Loader2, Trash2, TestTube,
  ChevronRight,
} from 'lucide-react';
import StatusBadge from '../components/ui/StatusBadge';
import Loader from '../components/ui/Loader';
import Portal from '../components/ui/Portal';
import { useApi } from '../hooks/useApi';
import * as api from '../services/api';
import type { DataSourceProvider, ConfiguredSource } from '../types';
import { palette } from '../lib/theme';

const PROVIDER_ICONS: Record<string, React.ElementType> = {
  simulated: Server,
  aws: Cloud,
  azure: Cloud,
  gcp: Cloud,
  prometheus: Database,
  docker: Container,
  logfile: FileText,
  custom: Send,
};

// Provider accents — desaturated to fit the warm-cream system while still
// staying brand-recognizable (amber for AWS, info-blue for Azure, etc.).
const PROVIDER_COLORS: Record<string, { bg: string; accent: string; glow: string }> = {
  simulated:  { bg: 'from-[rgba(61,125,101,0.10)] to-transparent',  accent: palette.success,       glow: '0 0 30px rgba(61,125,101,0.10)' },
  aws:        { bg: 'from-[rgba(192,138,62,0.12)] to-transparent',  accent: palette.warning,       glow: '0 0 30px rgba(192,138,62,0.10)' },
  azure:      { bg: 'from-[rgba(58,90,125,0.10)] to-transparent',   accent: palette.info,          glow: '0 0 30px rgba(58,90,125,0.10)' },
  gcp:        { bg: 'from-[rgba(208,82,77,0.10)] to-transparent',   accent: palette.critical,      glow: '0 0 30px rgba(208,82,77,0.10)' },
  prometheus: { bg: 'from-[rgba(192,138,62,0.10)] to-transparent',  accent: palette.warningStrong, glow: '0 0 30px rgba(176,122,46,0.10)' },
  docker:     { bg: 'from-[rgba(58,111,106,0.10)] to-transparent',  accent: palette.accentBright,  glow: '0 0 30px rgba(58,111,106,0.10)' },
  logfile:    { bg: 'from-[rgba(8,113,231,0.08)] to-transparent',    accent: palette.accent,        glow: '0 0 30px rgba(8,113,231,0.10)' },
  custom:     { bg: 'from-[rgba(102,71,116,0.10)] to-transparent',  accent: palette.plum,          glow: '0 0 30px rgba(102,71,116,0.10)' },
};

export default function DataSources() {
  const { data, loading, refetch } = useApi<{
    sources: ConfiguredSource[];
    available_providers: DataSourceProvider[];
  }>(api.getDataSources);

  const [configuring, setConfiguring] = useState<DataSourceProvider | null>(null);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  // Manual ingest state
  const [showIngest, setShowIngest] = useState(false);
  const [ingestData, setIngestData] = useState({
    node_name: '', node_type: 'server', cpu_percent: '50', memory_percent: '40',
    disk_percent: '30', error_rate: '1', latency_ms: '25',
  });
  const [ingestMsg, setIngestMsg] = useState('');

  if (loading) return <Loader text="Loading data sources…" />;

  const sources = data?.sources || [];
  const providers = data?.available_providers || [];

  const handleTest = async (provider: DataSourceProvider) => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await api.testDataSource({ provider: provider.id, config: formData });
      setTestResult(res);
    } catch (e: any) {
      setTestResult({ success: false, message: e.message });
    } finally { setTesting(false); }
  };

  const handleSave = async (provider: DataSourceProvider) => {
    setSaving(true);
    try {
      await api.configureDataSource({ provider: provider.id, enabled: true, config: formData });
      refetch();
      setConfiguring(null);
      setFormData({});
      setTestResult(null);
    } catch { /* */ } finally { setSaving(false); }
  };

  const handleRemove = async (provider: string) => {
    try {
      await api.removeDataSource(provider);
      refetch();
    } catch { /* */ }
  };

  const handleIngest = async () => {
    try {
      const res = await api.ingestMetrics({
        node_name: ingestData.node_name,
        node_type: ingestData.node_type,
        provider: 'custom',
        region: 'custom',
        ip_address: '0.0.0.0',
        cpu_percent: +ingestData.cpu_percent,
        memory_percent: +ingestData.memory_percent,
        disk_percent: +ingestData.disk_percent,
        network_in_mbps: 0, network_out_mbps: 0, request_rate: 0,
        error_rate: +ingestData.error_rate,
        latency_ms: +ingestData.latency_ms,
      });
      setIngestMsg(`Ingested for node ${res.node_name} (ID: ${res.node_id})`);
    } catch (e: any) { setIngestMsg(e.message); }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div>
        <h1 className="font-display text-[24px] sm:text-[28px] leading-tight text-[var(--color-ink)]">Data Sources</h1>
        <p className="text-xs sm:text-sm text-ink-mute mt-1">
          Connect to cloud platforms, monitoring tools, or use simulated data
        </p>
      </div>

      {/* ── Active sources ────────────────────────────────────── */}
      {sources.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-ink-soft mb-3">Active Sources</h2>
          <div className="flex flex-wrap gap-3">
            {sources.map(src => {
              const c = PROVIDER_COLORS[src.provider] || PROVIDER_COLORS.simulated;
              const Icon = PROVIDER_ICONS[src.provider] || Database;
              return (
                <motion.div
                  key={src.id}
                  layout
                  className="glass-sm flex items-center gap-3 px-4 py-3"
                  style={{ boxShadow: c.glow }}
                >
                  <Icon size={16} style={{ color: c.accent }} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-ink">{src.name || src.provider}</span>
                      <StatusBadge status={src.status} />
                    </div>
                    {src.summary && (
                      <p className="text-[10px] text-ink-faint mt-0.5 truncate max-w-[260px]">{src.summary}</p>
                    )}
                  </div>
                  {src.provider !== 'simulated' && (
                    <button
                      onClick={() => handleRemove(src.provider)}
                      className="ml-2 p-1 hover:bg-critical/15 rounded transition-colors"
                      title="Disconnect"
                    >
                      <Trash2 size={12} className="text-critical" />
                    </button>
                  )}
                </motion.div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Provider cards ────────────────────────────────────── */}
      <div>
        <h2 className="text-sm font-semibold text-ink-soft mb-3">Available Providers</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {providers.map((prov, i) => {
            const Icon = PROVIDER_ICONS[prov.id] || Database;
            const c = PROVIDER_COLORS[prov.id] || PROVIDER_COLORS.simulated;
            const isConfigured = sources.some(s => s.provider === prov.id);

            return (
              <motion.div
                key={prov.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                whileHover={{ scale: 1.02, boxShadow: c.glow }}
                onClick={() => {
                  if (prov.id === 'custom') { setShowIngest(true); return; }
                  if (prov.config_fields.length === 0 && prov.id === 'simulated') return;
                  const existing = sources.find(s => s.provider === prov.id);
                  setConfiguring(prov);
                  setFormData(existing?.config ? { ...existing.config } : {});
                  setTestResult(null);
                }}
                className={`glass p-5 cursor-pointer bg-gradient-to-b ${c.bg} space-y-3 transition-colors`}
              >
                <div className="flex items-center justify-between">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${c.accent}15` }}>
                    <Icon size={20} style={{ color: c.accent }} />
                  </div>
                  {isConfigured ? (
                    <span className="flex items-center gap-1 text-xs text-success">
                      <CheckCircle size={12} /> Connected
                    </span>
                  ) : (
                    <ChevronRight size={16} className="text-ink-faint" />
                  )}
                </div>
                <h3 className="text-ink font-semibold">{prov.name}</h3>
                <p className="text-xs text-ink-mute leading-relaxed">{prov.description}</p>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* ── Configuration modal ───────────────────────────────── */}
      <AnimatePresence>
        {configuring && (
          <Portal>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="sheet-backdrop flex items-center justify-center px-4"
            onClick={() => setConfiguring(null)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              onClick={e => e.stopPropagation()}
              className="glass-modal w-full max-w-lg p-6 space-y-5"
            >
              {(() => {
                const existing = sources.find(s => s.provider === configuring.id);
                const isReview = !!existing;
                return (
                  <>
                    <div className="flex items-center justify-between">
                      <h2 className="text-lg font-bold text-ink">
                        {isReview ? `${configuring.name} — Connected` : `Configure ${configuring.name}`}
                      </h2>
                      <button onClick={() => setConfiguring(null)} className="p-2 hover:bg-black/8 rounded-lg">
                        <X size={18} className="text-ink-mute" />
                      </button>
                    </div>
                    <p className="text-xs text-ink-mute">{configuring.description}</p>
                    {isReview && existing?.summary && (
                      <div className="text-[11px] text-ink-soft bg-success/8 border border-success/20 rounded-lg px-3 py-2">
                        <span className="font-medium text-success">Active:</span>{' '}{existing.summary}
                        {existing.error && (
                          <div className="text-critical mt-1">Last error: {existing.error}</div>
                        )}
                      </div>
                    )}
                    {isReview && (
                      <p className="text-[11px] text-ink-faint italic">
                        Credentials are stored securely. Leave the masked fields untouched to keep them, or type new values to replace them.
                      </p>
                    )}
                  </>
                );
              })()}

              {/* Config fields */}
              <div className="space-y-3">
                {configuring.config_fields.map(field => (
                  <div key={field.key}>
                    <label className="text-xs text-ink-mute block mb-1">
                      {field.label} {field.required && <span className="text-critical">*</span>}
                    </label>
                    {field.type === 'select' ? (
                      <select
                        value={formData[field.key] || ''}
                        onChange={e => setFormData({ ...formData, [field.key]: e.target.value })}
                        className="w-full bg-[var(--color-surface-strong)] border border-hairline-strong rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent/50"
                      >
                        <option value="">Select…</option>
                        {field.options?.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                      </select>
                    ) : field.type === 'textarea' ? (
                      <textarea
                        value={formData[field.key] || ''}
                        onChange={e => setFormData({ ...formData, [field.key]: e.target.value })}
                        rows={4}
                        className="w-full bg-[var(--color-surface-strong)] border border-hairline-strong rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent/50 resize-none"
                      />
                    ) : field.type === 'boolean' ? (
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData[field.key] === 'true'}
                          onChange={e => setFormData({ ...formData, [field.key]: String(e.target.checked) })}
                          className="w-4 h-4 rounded accent-accent"
                        />
                        <span className="text-sm text-ink-soft">Enable</span>
                      </label>
                    ) : (
                      <input
                        type={field.type === 'password' ? 'password' : field.type === 'number' ? 'number' : 'text'}
                        value={formData[field.key] || ''}
                        onChange={e => setFormData({ ...formData, [field.key]: e.target.value })}
                        className="w-full bg-[var(--color-surface-strong)] border border-hairline-strong rounded-lg px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent/50"
                      />
                    )}
                  </div>
                ))}
              </div>

              {/* Test result */}
              {testResult && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex items-center gap-2 p-3 rounded-lg text-xs ${
                    testResult.success ? 'bg-success/10 text-success border border-success/25' : 'bg-critical/10 text-critical border border-critical/25'
                  }`}
                >
                  {testResult.success ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
                  {testResult.message}
                </motion.div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={() => handleTest(configuring)}
                  disabled={testing}
                  className="flex items-center gap-2 px-4 py-2.5 bg-black/5 text-ink-soft rounded-lg text-sm font-medium hover:bg-black/10 transition-colors disabled:opacity-40"
                >
                  {testing ? <Loader2 size={14} className="animate-spin" /> : <TestTube size={14} />}
                  Test Connection
                </button>
                <button
                  onClick={() => handleSave(configuring)}
                  disabled={saving}
                  className="flex items-center gap-2 px-5 py-2.5 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-bright transition-colors disabled:opacity-40"
                >
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                  {sources.some(s => s.provider === configuring.id) ? 'Update' : 'Save & Connect'}
                </button>
              </div>
            </motion.div>
          </motion.div>
          </Portal>
        )}
      </AnimatePresence>

      {/* ── Custom API Ingest modal ───────────────────────────── */}
      <AnimatePresence>
        {showIngest && (
          <Portal>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="sheet-backdrop flex items-center justify-center px-4"
            onClick={() => setShowIngest(false)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              onClick={e => e.stopPropagation()}
              className="glass-modal w-full max-w-lg p-6 space-y-5"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-ink">Push Metrics via API</h2>
                <button onClick={() => setShowIngest(false)} className="p-2 hover:bg-black/8 rounded-lg">
                  <X size={18} className="text-ink-mute" />
                </button>
              </div>

              <p className="text-xs text-ink-mute">
                Manually push metric data for any node. Useful for testing or custom integrations.
              </p>

              <div className="grid grid-cols-2 gap-3">
                {[
                  { key: 'node_name', label: 'Node Name', full: true },
                  { key: 'node_type', label: 'Node Type' },
                  { key: 'cpu_percent', label: 'CPU %', type: 'number' },
                  { key: 'memory_percent', label: 'Memory %', type: 'number' },
                  { key: 'disk_percent', label: 'Disk %', type: 'number' },
                  { key: 'error_rate', label: 'Error Rate %', type: 'number' },
                  { key: 'latency_ms', label: 'Latency ms', type: 'number' },
                ].map(f => (
                  <div key={f.key} className={f.full ? 'col-span-2' : ''}>
                    <label className="text-xs text-ink-mute block mb-1">{f.label}</label>
                    <input
                      type={f.type || 'text'}
                      value={(ingestData as any)[f.key]}
                      onChange={e => setIngestData({ ...ingestData, [f.key]: e.target.value })}
                      className="w-full bg-[var(--color-surface-strong)] border border-hairline-strong rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent/50"
                    />
                  </div>
                ))}
              </div>

              {ingestMsg && (
                <div className="text-xs text-accent bg-accent/10 p-2 rounded-lg">{ingestMsg}</div>
              )}

              <button
                onClick={handleIngest}
                disabled={!ingestData.node_name}
                className="flex items-center gap-2 px-5 py-2.5 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-bright transition-colors disabled:opacity-40"
              >
                <Send size={14} />
                Push Metrics
              </button>
            </motion.div>
          </motion.div>
          </Portal>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
