import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Settings as SettingsIcon, Brain, Cpu, Timer, Plus, X, Check,
  RefreshCw, ChevronDown, Loader2, Server, Cloud,
  AlertCircle, KeyRound, Eye, EyeOff, ShieldAlert,
} from 'lucide-react';
import GlassCard from '../components/ui/GlassCard';
import * as api from '../services/api';

type LlmMode = 'local' | 'online';

interface SettingsData {
  // New UI mode fields
  llm_mode: LlmMode;
  online_provider_name: string;
  fallback_provider_name: string;
  fallback_model: string;
  fallback_api_key: string;
  fallback_api_key_set: boolean;

  // Legacy (kept for backend compat)
  llm_provider: string;

  // Ollama (local)
  ollama_model: string;
  ollama_embedding_model: string;
  ollama_base_url: string;

  // Primary online API key (reuses gemini_api_key slot)
  gemini_api_key: string;
  gemini_api_key_set: boolean;
  gemini_model: string;

  // OpenAI (kept for compat)
  openai_api_key: string;
  openai_api_key_set: boolean;
  openai_model: string;

  // Embedding
  embedding_provider: 'google' | 'ollama';
  gemini_embedding_model: string;
  gemini_embedding_api_key: string;
  gemini_embedding_api_key_set: boolean;

  // Shared
  agent_temperature: number;

  // Per-agent temperatures
  monitoring_temperature: number;
  predictive_temperature: number;
  diagnostic_temperature: number;
  remediation_temperature: number;
  reporting_temperature: number;

  custom_llm_models: string[];
  custom_embedding_models: string[];
  custom_openai_models: string[];
  custom_gemini_models: string[];
  auto_run_pipeline: boolean;
  auto_run_interval_seconds: number;
}

interface OllamaModel {
  name: string;
  size: number;
  modified_at: string;
}

const DEFAULT_OLLAMA_LLM_OPTIONS = [
  'llama3.2:3b', 'qwen2.5-coder:7b', 'mistral-nemo',
  'deepseek-coder-v2', 'codellama:7b', 'gemma2:9b', 'gemma3:4b',
];

const DEFAULT_EMBEDDING_OPTIONS = [
  'nomic-embed-text', 'mxbai-embed-large', 'all-minilm', 'snowflake-arctic-embed',
  'bge-large', 'bge-m3', 'e5-mistral-7b-instruct', 'nomic-embed-text:v1.5',
];

// Cloud LLM providers shown in the dropdown. Only Gemini is fully wired
// in the backend right now — the others use static model lists and would
// need a real adapter before they can actually serve traffic.
const ONLINE_PROVIDERS = [
  { id: 'gemini',  label: 'Google Gemini' },
  { id: 'openai',  label: 'OpenAI' },
  { id: 'grok',    label: 'xAI Grok' },
  { id: 'mistral', label: 'Mistral AI' },
] as const;
type ProviderId = typeof ONLINE_PROVIDERS[number]['id'];

// Map any legacy free-text provider name (e.g. "Lanja") to a real provider.
function normalizeProvider(name: string | undefined): ProviderId {
  const n = (name || '').toLowerCase();
  if (n.includes('openai') || n.includes('gpt')) return 'openai';
  if (n.includes('grok') || n.includes('xai')) return 'grok';
  if (n.includes('mistral') || n.includes('mixtral')) return 'mistral';
  return 'gemini'; // default + catches "Gemini", "Lanja", anything else
}


type AgentTempKey =
  | 'monitoring_temperature'
  | 'predictive_temperature'
  | 'diagnostic_temperature'
  | 'remediation_temperature'
  | 'reporting_temperature';

const AGENT_TEMP_ROWS: { key: AgentTempKey; label: string; hint: string }[] = [
  { key: 'monitoring_temperature',  label: 'Monitoring',  hint: 'low = stable signal classification' },
  { key: 'predictive_temperature',  label: 'Predictive',  hint: 'low = consistent forecasts' },
  { key: 'diagnostic_temperature',  label: 'Diagnostic',  hint: 'moderate = better root-cause reasoning' },
  { key: 'remediation_temperature', label: 'Remediation', hint: '0.0 recommended for safe actions' },
  { key: 'reporting_temperature',   label: 'Reporting',   hint: 'higher = more natural summaries' },
];

const clampTemp = (v: number) => Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0));

function TempControl({
  label,
  hint,
  value,
  onLocalChange,
  onCommit,
}: {
  label: string;
  hint: string;
  value: number;
  onLocalChange: (v: number) => void;
  onCommit: (v: number) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-medium text-ink-soft">{label}</div>
          <div className="text-[10px] text-ink-faint">{hint}</div>
        </div>
        <input
          type="number"
          min={0}
          max={1}
          step={0.05}
          value={value}
          onChange={(e) => onLocalChange(clampTemp(parseFloat(e.target.value)))}
          onBlur={(e) => onCommit(clampTemp(parseFloat(e.target.value)))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onCommit(clampTemp(parseFloat((e.target as HTMLInputElement).value)));
          }}
          className="w-20 glass-sm rounded-lg px-2 py-1 text-xs font-medium text-center text-ink focus:outline-none focus:ring-2 focus:ring-accent/40"
        />
      </div>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={value}
        onChange={(e) => onLocalChange(parseFloat(e.target.value))}
        onMouseUp={(e) => onCommit(parseFloat((e.target as HTMLInputElement).value))}
        onTouchEnd={(e) => onCommit(parseFloat((e.target as HTMLInputElement).value))}
        className="w-full h-2 bg-ink/10 rounded-lg appearance-none cursor-pointer accent-accent"
      />
      <div className="flex justify-between text-[10px] text-ink-faint">
        <span>0 (Precise)</span>
        <span>1 (Creative)</span>
      </div>
    </div>
  );
}

export default function Settings() {
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [ollamaModels, setOllamaModels] = useState<OllamaModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Custom-model input state
  const [newOllamaModel, setNewOllamaModel] = useState('');
  const [newEmbeddingModel, setNewEmbeddingModel] = useState('');

  // Dropdown-open state
  const [openDropdown, setOpenDropdown] = useState<
    | 'ollama-llm' | 'ollama-embedding' | 'google-embedding'
    | 'online-provider' | 'online-model'
    | 'fallback-provider' | 'fallback-model'
    | null
  >(null);

  // Live model lists for the online & fallback dropdowns. Reload whenever
  // the user picks a different provider so the dropdown matches what that
  // vendor actually exposes.
  const [onlineModels, setOnlineModels] = useState<string[]>([]);
  const [onlineModelsLoading, setOnlineModelsLoading] = useState(false);
  const [fallbackModels, setFallbackModels] = useState<string[]>([]);
  const [fallbackModelsLoading, setFallbackModelsLoading] = useState(false);

  // Optional embedding-only API key draft (separate from the primary key).
  const [embeddingKeyDraft, setEmbeddingKeyDraft] = useState('');
  const [showEmbeddingKey, setShowEmbeddingKey] = useState(false);

  // Primary online key draft
  const [primaryKeyDraft, setPrimaryKeyDraft] = useState('');
  const [showPrimaryKey, setShowPrimaryKey] = useState(false);

  // Fallback key draft
  const [fallbackKeyDraft, setFallbackKeyDraft] = useState('');
  const [showFallbackKey, setShowFallbackKey] = useState(false);

  // Test-connection state
  const [testingPrimary, setTestingPrimary] = useState(false);
  const [testingFallback, setTestingFallback] = useState(false);
  const [testPrimaryResult, setTestPrimaryResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [testFallbackResult, setTestFallbackResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [testingOllama, setTestingOllama] = useState(false);
  const [testOllamaResult, setTestOllamaResult] = useState<{ ok: boolean; message: string } | null>(null);

  const fetchSettings = useCallback(async () => {
    try {
      const [settingsData, modelsData] = await Promise.all([
        api.getSettings(),
        api.getOllamaModels(),
      ]);
      setSettings(settingsData);
      setOllamaModels(modelsData.models || []);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  // Fetch the live model list for the active primary online provider.
  // Only Gemini calls a live API; the others get a curated static list.
  useEffect(() => {
    if (!settings) return;
    const provider = normalizeProvider(settings.online_provider_name);
    setOnlineModelsLoading(true);
    api.getLlmModels(provider).then((res) => {
      setOnlineModels((res.models || []).filter((m) => !m.deprecated).map((m) => m.name));
    }).catch(() => {
      setOnlineModels([]);
    }).finally(() => setOnlineModelsLoading(false));
  }, [settings?.online_provider_name, settings?.gemini_api_key_set]);

  useEffect(() => {
    if (!settings) return;
    const provider = normalizeProvider(settings.fallback_provider_name);
    setFallbackModelsLoading(true);
    api.getLlmModels(provider).then((res) => {
      setFallbackModels((res.models || []).filter((m) => !m.deprecated).map((m) => m.name));
    }).catch(() => {
      setFallbackModels([]);
    }).finally(() => setFallbackModelsLoading(false));
  }, [settings?.fallback_provider_name, settings?.fallback_api_key_set]);

  const save = async (partial: Partial<SettingsData>) => {
    if (!settings) return;
    setSaving(true);
    setSaved(false);
    try {
      const updated = await api.updateSettings(partial);
      setSettings(updated);
      setSaved(true);
      setError(null);
      setTimeout(() => setSaved(false), 2000);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const savePrimaryKey = async () => {
    if (!primaryKeyDraft.trim()) return;
    await save({ gemini_api_key: primaryKeyDraft.trim() });
    setPrimaryKeyDraft('');
    setShowPrimaryKey(false);
  };

  const saveFallbackKey = async () => {
    if (!fallbackKeyDraft.trim()) return;
    await save({ fallback_api_key: fallbackKeyDraft.trim() });
    setFallbackKeyDraft('');
    setShowFallbackKey(false);
  };

  const runTestPrimary = async () => {
    setTestingPrimary(true);
    setTestPrimaryResult(null);
    try {
      const body: any = { provider: 'gemini', key_slot: 'gemini_api_key' };
      if (primaryKeyDraft.trim()) body.api_key = primaryKeyDraft.trim();
      setTestPrimaryResult(await api.testLlmProvider(body));
    } catch (e: any) {
      setTestPrimaryResult({ ok: false, message: e.message });
    } finally {
      setTestingPrimary(false);
    }
  };

  const runTestFallback = async () => {
    setTestingFallback(true);
    setTestFallbackResult(null);
    try {
      const body: any = { provider: 'gemini', key_slot: 'fallback_api_key' };
      if (fallbackKeyDraft.trim()) body.api_key = fallbackKeyDraft.trim();
      setTestFallbackResult(await api.testLlmProvider(body));
    } catch (e: any) {
      setTestFallbackResult({ ok: false, message: e.message });
    } finally {
      setTestingFallback(false);
    }
  };

  const runTestOllama = async () => {
    setTestingOllama(true);
    setTestOllamaResult(null);
    try {
      setTestOllamaResult(await api.testLlmProvider({ provider: 'ollama' }));
    } catch (e: any) {
      setTestOllamaResult({ ok: false, message: e.message });
    } finally {
      setTestingOllama(false);
    }
  };

  const addCustomModel = (
    bucket: 'custom_llm_models' | 'custom_embedding_models' | 'custom_openai_models' | 'custom_gemini_models',
    value: string,
    reset: () => void,
  ) => {
    if (!settings) return;
    const trimmed = value.trim();
    if (!trimmed) return;
    const existing = settings[bucket];
    if (existing.includes(trimmed)) return;
    save({ [bucket]: [...existing, trimmed] } as Partial<SettingsData>);
    reset();
  };

  const removeCustomModel = (
    bucket: 'custom_llm_models' | 'custom_embedding_models' | 'custom_openai_models' | 'custom_gemini_models',
    model: string,
  ) => {
    if (!settings) return;
    save({ [bucket]: settings[bucket].filter((m) => m !== model) } as Partial<SettingsData>);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-accent" />
        <span className="ml-3 text-ink-mute">Loading settings...</span>
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <p className="text-critical text-sm">Failed to load settings: {error}</p>
        <button onClick={fetchSettings} className="text-accent text-sm underline">Retry</button>
      </div>
    );
  }

  const llmMode: LlmMode = (settings.llm_mode as LlmMode) || 'online';

  const installedOllamaNames = ollamaModels.map((m) => m.name);
  const isInstalled = (model: string) =>
    installedOllamaNames.some((n) => n === model || n === `${model}:latest`);

  const ollamaLlmOptions = [...new Set([
    ...installedOllamaNames, ...DEFAULT_OLLAMA_LLM_OPTIONS,
    ...settings.custom_llm_models, settings.ollama_model,
  ])].sort();

  const ollamaEmbeddingOptions = [...new Set([
    ...DEFAULT_EMBEDDING_OPTIONS, ...settings.custom_embedding_models, settings.ollama_embedding_model,
  ])].sort();

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
      {/* Header */}
      <div className="flex items-start sm:items-center justify-between flex-col sm:flex-row gap-3 sm:gap-4">
        <div>
          <h1 className="font-display text-[24px] sm:text-[28px] leading-tight text-[var(--color-ink)] flex items-center gap-3">
            <SettingsIcon size={20} className="text-[var(--color-accent)]" />
            Settings
          </h1>
          <p className="text-xs sm:text-sm text-ink-mute mt-1">
            Configure your active LLM provider, pipeline behaviour, and runtime options
          </p>
        </div>
        <div className="flex items-center gap-3">
          {saved && (
            <motion.span
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              className="text-xs text-success flex items-center gap-1"
            >
              <Check size={14} /> Saved
            </motion.span>
          )}
          {saving && <Loader2 size={14} className="animate-spin text-accent" />}
          <button
            onClick={fetchSettings}
            className="glass-sm p-2 rounded-lg hover:bg-accent/8 transition-colors"
            title="Refresh"
          >
            <RefreshCw size={16} className="text-ink-mute" />
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-critical/10 border border-critical/25 rounded-xl p-3 text-sm text-critical flex items-center gap-2">
          <AlertCircle size={14} /> {error}
        </div>
      )}

      {/* ── LLM Provider ─────────────────────────────────── */}
      <GlassCard hover={false} className="relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-[var(--color-accent-glow)] to-transparent rounded-bl-full pointer-events-none" />
        <div className="relative">
          <div className="flex items-center gap-3 mb-5">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{
                background: 'linear-gradient(135deg, var(--color-accent) 0%, var(--color-accent-dim) 100%)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.18), 0 6px 16px -6px var(--color-accent-glow)',
              }}
            >
              <Brain size={20} className="text-[var(--color-surface)]" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-ink">LLM Provider</h2>
              <p className="text-xs text-ink-mute">Configure the AI model that powers your AIOps agents</p>
            </div>
          </div>

          {/* Local / Online tabs */}
          <div className="flex gap-2 mb-5">
            {(['local', 'online'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => save({ llm_mode: mode })}
                className={`flex-1 flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors cursor-pointer ${
                  llmMode === mode
                    ? 'bg-accent text-[var(--color-surface)] shadow-sm'
                    : 'glass-sm text-ink-soft hover:bg-accent/8'
                }`}
              >
                {mode === 'local' ? <Server size={15} /> : <Cloud size={15} />}
                {mode === 'local' ? 'Local' : 'Online'}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-ink-faint mb-5 -mt-2">
            {llmMode === 'local'
              ? 'Best for privacy — runs entirely on your machine, no internet required.'
              : 'Best for accuracy — uses a cloud AI provider with your API key.'}
          </p>

          {/* LOCAL panel */}
          {llmMode === 'local' && (
            <div className="space-y-4">
              <div>
                <label className="text-xs text-ink-mute mb-1.5 block">Model</label>
                <div className="relative">
                  <button
                    onClick={() => setOpenDropdown(openDropdown === 'ollama-llm' ? null : 'ollama-llm')}
                    className="w-full flex items-center justify-between glass-sm rounded-lg px-3 py-2.5 text-sm text-ink hover:ring-2 hover:ring-accent/40"
                  >
                    <span className="font-medium">{settings.ollama_model}</span>
                    <ChevronDown size={14} className={`text-ink-faint transition-transform ${openDropdown === 'ollama-llm' ? 'rotate-180' : ''}`} />
                  </button>
                  {openDropdown === 'ollama-llm' && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="absolute z-30 mt-1 w-full glass-dropdown max-h-52 overflow-y-auto"
                    >
                      {ollamaLlmOptions.map((model) => (
                        <button
                          key={model}
                          onClick={() => { save({ ollama_model: model }); setOpenDropdown(null); }}
                          className={`w-full text-left px-3 py-2 text-sm hover:bg-accent/8 flex items-center justify-between ${
                            model === settings.ollama_model ? 'bg-accent/10 text-accent font-medium' : 'text-ink-soft'
                          }`}
                        >
                          <span>{model}</span>
                          {isInstalled(model) && (
                            <span className="text-[10px] bg-accent/12 text-accent px-1.5 py-0.5 rounded-full">installed</span>
                          )}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </div>
              </div>

              <div>
                <label className="text-xs text-ink-mute mb-1.5 block">Base URL</label>
                <input
                  type="text"
                  value={settings.ollama_base_url}
                  onChange={(e) => setSettings({ ...settings, ollama_base_url: e.target.value })}
                  onBlur={(e) => save({ ollama_base_url: e.target.value.trim() })}
                  onKeyDown={(e) => { if (e.key === 'Enter') save({ ollama_base_url: (e.target as HTMLInputElement).value.trim() }); }}
                  className="w-full glass-sm rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent/40"
                />
              </div>

              <div>
                <label className="text-xs text-ink-mute mb-1.5 block">Add Custom Model</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newOllamaModel}
                    onChange={(e) => setNewOllamaModel(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addCustomModel('custom_llm_models', newOllamaModel, () => setNewOllamaModel(''))}
                    placeholder="e.g. phi3:mini"
                    className="flex-1 glass-sm rounded-lg px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-accent/40"
                  />
                  <button
                    onClick={() => addCustomModel('custom_llm_models', newOllamaModel, () => setNewOllamaModel(''))}
                    className="glass-sm rounded-lg px-3 py-2 hover:bg-accent/8"
                  >
                    <Plus size={16} className="text-accent" />
                  </button>
                </div>
                {settings.custom_llm_models.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {settings.custom_llm_models.map((m) => (
                      <span key={m} className="inline-flex items-center gap-1 text-xs bg-ink/8 text-ink-soft px-2 py-1 rounded-full">
                        {m}
                        <button onClick={() => removeCustomModel('custom_llm_models', m)} className="hover:text-critical"><X size={12} /></button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <button
                onClick={runTestOllama}
                disabled={testingOllama}
                className="w-full glass-sm rounded-lg px-3 py-2 text-sm font-medium text-accent hover:bg-accent/8 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {testingOllama ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                Test Connection
              </button>
              {testOllamaResult && (
                <p className={`text-[11px] flex items-center gap-1 ${testOllamaResult.ok ? 'text-success' : 'text-critical'}`}>
                  {testOllamaResult.ok ? <Check size={12} /> : <X size={12} />}
                  {testOllamaResult.message}
                </p>
              )}
            </div>
          )}

          {/* ONLINE panel */}
          {llmMode === 'online' && (
            <div className="space-y-4">
              <div>
                <label className="text-xs text-ink-mute mb-1.5 block">Provider</label>
                <div className="relative">
                  <button
                    onClick={() => setOpenDropdown(openDropdown === 'online-provider' ? null : 'online-provider')}
                    className="w-full flex items-center justify-between glass-sm rounded-lg px-3 py-2.5 text-sm text-ink hover:ring-2 hover:ring-accent/40"
                  >
                    <span className="font-medium">
                      {ONLINE_PROVIDERS.find((p) => p.id === normalizeProvider(settings.online_provider_name))?.label || 'Gemini'}
                    </span>
                    <ChevronDown size={14} className={`text-ink-faint transition-transform ${openDropdown === 'online-provider' ? 'rotate-180' : ''}`} />
                  </button>
                  {openDropdown === 'online-provider' && (
                    <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="absolute z-30 mt-1 w-full glass-dropdown">
                      {ONLINE_PROVIDERS.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => { save({ online_provider_name: p.label }); setOpenDropdown(null); }}
                          className={`w-full text-left px-3 py-2 text-sm hover:bg-accent/8 ${
                            normalizeProvider(settings.online_provider_name) === p.id ? 'bg-accent/10 text-accent font-medium' : 'text-ink-soft'
                          }`}
                        >
                          {p.label}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </div>
              </div>

              <div>
                <label className="text-xs text-ink-mute mb-1.5 block">API Key</label>
                {settings.gemini_api_key_set && !primaryKeyDraft && (
                  <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                    <div className="flex-1 min-w-[180px] glass-sm rounded-lg px-3 py-2.5 text-sm font-mono text-ink-soft flex items-center gap-2">
                      <KeyRound size={14} className="text-success" />
                      ••••••••••••••••
                      <span className="ml-auto text-[10px] text-success">saved</span>
                    </div>
                    <button onClick={() => setPrimaryKeyDraft(' ')} className="glass-sm rounded-lg px-3 py-2.5 text-xs text-ink-soft hover:bg-canvas-soft">Change</button>
                    <button onClick={() => save({ gemini_api_key: '' })} className="glass-sm rounded-lg px-3 py-2.5 text-xs text-critical hover:bg-critical/10">Remove</button>
                  </div>
                )}
                {(!settings.gemini_api_key_set || primaryKeyDraft) && (
                  <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                    <div className="relative flex-1 min-w-[180px]">
                      <input
                        type={showPrimaryKey ? 'text' : 'password'}
                        value={primaryKeyDraft}
                        onChange={(e) => setPrimaryKeyDraft(e.target.value)}
                        placeholder="API key..."
                        autoComplete="off"
                        className="w-full glass-sm rounded-lg px-3 py-2.5 pr-10 text-sm font-mono text-ink focus:outline-none focus:ring-2 focus:ring-accent/40"
                      />
                      <button type="button" onClick={() => setShowPrimaryKey(!showPrimaryKey)} className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink-soft">
                        {showPrimaryKey ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                    <button onClick={savePrimaryKey} disabled={!primaryKeyDraft.trim()} className="glass-sm rounded-lg px-3 py-2.5 text-xs font-medium text-accent hover:bg-accent/8 disabled:opacity-50">Save</button>
                    {settings.gemini_api_key_set && (
                      <button onClick={() => setPrimaryKeyDraft('')} className="glass-sm rounded-lg px-3 py-2.5 text-xs text-ink-mute hover:bg-canvas-soft">Cancel</button>
                    )}
                  </div>
                )}
              </div>

              <div>
                <label className="text-xs text-ink-mute mb-1.5 block flex items-center gap-2">
                  Model
                  {onlineModelsLoading && <Loader2 size={11} className="animate-spin text-ink-faint" />}
                </label>
                <div className="relative">
                  <button
                    onClick={() => setOpenDropdown(openDropdown === 'online-model' ? null : 'online-model')}
                    className="w-full flex items-center justify-between glass-sm rounded-lg px-3 py-2.5 text-sm text-ink hover:ring-2 hover:ring-accent/40"
                  >
                    <span className="font-medium">{settings.gemini_model || (onlineModels[0] ?? 'select model')}</span>
                    <ChevronDown size={14} className={`text-ink-faint transition-transform ${openDropdown === 'online-model' ? 'rotate-180' : ''}`} />
                  </button>
                  {openDropdown === 'online-model' && (
                    <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="absolute z-30 mt-1 w-full glass-dropdown max-h-72 overflow-y-auto">
                      {onlineModels.length === 0 && (
                        <div className="px-3 py-2 text-xs text-ink-faint">
                          {onlineModelsLoading ? 'Fetching…' : 'No models available — add an API key first'}
                        </div>
                      )}
                      {onlineModels.map((m) => (
                        <button
                          key={m}
                          onClick={() => { save({ gemini_model: m }); setOpenDropdown(null); }}
                          className={`w-full text-left px-3 py-2 text-sm hover:bg-accent/8 ${
                            settings.gemini_model === m ? 'bg-accent/10 text-accent font-medium' : 'text-ink-soft'
                          }`}
                        >
                          {m}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </div>
                <p className="text-[11px] text-ink-faint mt-1.5">
                  Models available for your selected provider.
                </p>
              </div>

              <button
                onClick={runTestPrimary}
                disabled={testingPrimary || (!settings.gemini_api_key_set && !primaryKeyDraft.trim())}
                className="w-full glass-sm rounded-lg px-3 py-2 text-sm font-medium text-accent hover:bg-accent/8 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {testingPrimary ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                Test Connection
              </button>
              {testPrimaryResult && (
                <p className={`text-[11px] flex items-center gap-1 ${testPrimaryResult.ok ? 'text-success' : 'text-critical'}`}>
                  {testPrimaryResult.ok ? <Check size={12} /> : <X size={12} />}
                  {testPrimaryResult.message}
                </p>
              )}
            </div>
          )}
        </div>
      </GlassCard>

      {/* ── Fallback LLM ──────────────────────────────────── */}
      <GlassCard hover={false}>
        <div className="flex items-center gap-3 mb-2">
          <ShieldAlert size={18} className="text-warning" />
          <div>
            <h2 className="text-sm font-semibold text-ink">Fallback LLM</h2>
            <p className="text-[11px] text-ink-mute">Used automatically when primary hits rate limits (429 / 503)</p>
          </div>
        </div>

        <div className="mt-4 space-y-4">
          <div>
            <label className="text-xs text-ink-mute mb-1.5 block">Provider</label>
            <div className="relative">
              <button
                onClick={() => setOpenDropdown(openDropdown === 'fallback-provider' ? null : 'fallback-provider')}
                className="w-full flex items-center justify-between glass-sm rounded-lg px-3 py-2.5 text-sm text-ink hover:ring-2 hover:ring-accent/40"
              >
                <span className="font-medium">
                  {ONLINE_PROVIDERS.find((p) => p.id === normalizeProvider(settings.fallback_provider_name))?.label || 'Gemini'}
                </span>
                <ChevronDown size={14} className={`text-ink-faint transition-transform ${openDropdown === 'fallback-provider' ? 'rotate-180' : ''}`} />
              </button>
              {openDropdown === 'fallback-provider' && (
                <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="absolute z-30 mt-1 w-full glass-dropdown">
                  {ONLINE_PROVIDERS.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => { save({ fallback_provider_name: p.label }); setOpenDropdown(null); }}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-accent/8 ${
                        normalizeProvider(settings.fallback_provider_name) === p.id ? 'bg-accent/10 text-accent font-medium' : 'text-ink-soft'
                      }`}
                    >
                      {p.label}{p.id !== 'gemini' && <span className="ml-2 text-[10px] text-ink-faint">(catalog only)</span>}
                    </button>
                  ))}
                </motion.div>
              )}
            </div>
          </div>

          <div>
            <label className="text-xs text-ink-mute mb-1.5 block">API Key</label>
            {settings.fallback_api_key_set && !fallbackKeyDraft && (
              <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                <div className="flex-1 min-w-[180px] glass-sm rounded-lg px-3 py-2.5 text-sm font-mono text-ink-soft flex items-center gap-2">
                  <KeyRound size={14} className="text-success" />
                  ••••••••••••••••
                  <span className="ml-auto text-[10px] text-success">saved</span>
                </div>
                <button onClick={() => setFallbackKeyDraft(' ')} className="glass-sm rounded-lg px-3 py-2.5 text-xs text-ink-soft hover:bg-canvas-soft">Change</button>
                <button onClick={() => save({ fallback_api_key: '' })} className="glass-sm rounded-lg px-3 py-2.5 text-xs text-critical hover:bg-critical/10">Remove</button>
              </div>
            )}
            {(!settings.fallback_api_key_set || fallbackKeyDraft) && (
              <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                <div className="relative flex-1 min-w-[180px]">
                  <input
                    type={showFallbackKey ? 'text' : 'password'}
                    value={fallbackKeyDraft}
                    onChange={(e) => setFallbackKeyDraft(e.target.value)}
                    placeholder="API key..."
                    autoComplete="off"
                    className="w-full glass-sm rounded-lg px-3 py-2.5 pr-10 text-sm font-mono text-ink focus:outline-none focus:ring-2 focus:ring-accent/40"
                  />
                  <button type="button" onClick={() => setShowFallbackKey(!showFallbackKey)} className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink-soft">
                    {showFallbackKey ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                <button onClick={saveFallbackKey} disabled={!fallbackKeyDraft.trim()} className="glass-sm rounded-lg px-3 py-2.5 text-xs font-medium text-accent hover:bg-accent/8 disabled:opacity-50">Save</button>
                {settings.fallback_api_key_set && (
                  <button onClick={() => setFallbackKeyDraft('')} className="glass-sm rounded-lg px-3 py-2.5 text-xs text-ink-mute hover:bg-canvas-soft">Cancel</button>
                )}
              </div>
            )}
          </div>

          <div>
            <label className="text-xs text-ink-mute mb-1.5 block flex items-center gap-2">
              Model
              {fallbackModelsLoading && <Loader2 size={11} className="animate-spin text-ink-faint" />}
            </label>
            <div className="relative">
              <button
                onClick={() => setOpenDropdown(openDropdown === 'fallback-model' ? null : 'fallback-model')}
                className="w-full flex items-center justify-between glass-sm rounded-lg px-3 py-2.5 text-sm text-ink hover:ring-2 hover:ring-accent/40"
              >
                <span className="font-medium">{settings.fallback_model || (fallbackModels[0] ?? 'select model')}</span>
                <ChevronDown size={14} className={`text-ink-faint transition-transform ${openDropdown === 'fallback-model' ? 'rotate-180' : ''}`} />
              </button>
              {openDropdown === 'fallback-model' && (
                <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="absolute z-30 mt-1 w-full glass-dropdown max-h-72 overflow-y-auto">
                  {fallbackModels.length === 0 && (
                    <div className="px-3 py-2 text-xs text-ink-faint">
                      {fallbackModelsLoading ? 'Fetching…' : 'No models available'}
                    </div>
                  )}
                  {fallbackModels.map((m) => (
                    <button
                      key={m}
                      onClick={() => { save({ fallback_model: m }); setOpenDropdown(null); }}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-accent/8 ${
                        settings.fallback_model === m ? 'bg-accent/10 text-accent font-medium' : 'text-ink-soft'
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </motion.div>
              )}
            </div>
          </div>

          <button
            onClick={runTestFallback}
            disabled={testingFallback || (!settings.fallback_api_key_set && !fallbackKeyDraft.trim())}
            className="w-full glass-sm rounded-lg px-3 py-2 text-sm font-medium text-accent hover:bg-accent/8 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {testingFallback ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Test Fallback Connection
          </button>
          {testFallbackResult && (
            <p className={`text-[11px] flex items-center gap-1 ${testFallbackResult.ok ? 'text-success' : 'text-critical'}`}>
              {testFallbackResult.ok ? <Check size={12} /> : <X size={12} />}
              {testFallbackResult.message}
            </p>
          )}
        </div>
      </GlassCard>

      {/* ── Vector Store & Embeddings ────────────────────── */}
      <GlassCard hover={false}>
        <div className="flex items-center gap-2 mb-4">
          <Cpu size={18} className="text-accent" />
          <h2 className="text-sm font-semibold text-ink-soft">Vector Store &amp; Embeddings</h2>
        </div>

        {/* Provider toggle */}
        <label className="text-xs text-ink-mute mb-2 block">Embedding Provider</label>
        <div className="flex gap-2 mb-5">
          {(['google', 'ollama'] as const).map((p) => {
            const ProvIcon = p === 'google' ? Cloud : Server;
            return (
              <button
                key={p}
                onClick={() => save({ embedding_provider: p })}
                className={`flex-1 inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors cursor-pointer ${
                  settings.embedding_provider === p
                    ? 'bg-accent text-[var(--color-surface)] shadow-sm'
                    : 'glass-sm text-ink-soft hover:bg-accent/8'
                }`}
              >
                <ProvIcon size={15} />
                {p === 'google' ? 'Google Gemini' : 'Ollama (local)'}
              </button>
            );
          })}
        </div>

        {/* Google model selector */}
        {settings.embedding_provider === 'google' && (
          <div>
            <label className="text-xs text-ink-mute mb-1.5 block">Google Embedding Model</label>
            <div className="relative">
              <button
                onClick={() => setOpenDropdown(openDropdown === 'google-embedding' ? null : 'google-embedding')}
                className="w-full flex items-center justify-between glass-sm rounded-lg px-3 py-2.5 text-sm text-ink hover:ring-2 hover:ring-accent/40"
              >
                <span className="font-medium">{settings.gemini_embedding_model || 'models/text-embedding-004'}</span>
                <ChevronDown size={14} className={`text-ink-faint transition-transform ${openDropdown === 'google-embedding' ? 'rotate-180' : ''}`} />
              </button>
              {openDropdown === 'google-embedding' && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="absolute z-30 mt-1 w-full glass-dropdown"
                >
                  {['models/text-embedding-004', 'models/embedding-001'].map((model) => (
                    <button
                      key={model}
                      onClick={() => { save({ gemini_embedding_model: model }); setOpenDropdown(null); }}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-accent/8 flex items-center justify-between ${
                        settings.gemini_embedding_model === model ? 'bg-accent/10 text-accent font-medium' : 'text-ink-soft'
                      }`}
                    >
                      <span>{model}</span>
                      {model === 'models/text-embedding-004' && <span className="text-[10px] text-accent">recommended</span>}
                    </button>
                  ))}
                </motion.div>
              )}
            </div>
            <p className="text-[11px] text-ink-faint mt-2">Free within Google AI quota — no model download required.</p>

            {/* Optional embedding-specific API key. Empty → reuse primary Gemini key. */}
            <div className="mt-4">
              <label className="text-xs text-ink-mute mb-1.5 block">Embedding API Key (optional)</label>
              {settings.gemini_embedding_api_key_set && !embeddingKeyDraft && (
                <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                  <div className="flex-1 min-w-[180px] glass-sm rounded-lg px-3 py-2.5 text-sm font-mono text-ink-soft flex items-center gap-2">
                    <KeyRound size={14} className="text-success" />
                    ••••••••••••••••
                    <span className="ml-auto text-[10px] text-success">override active</span>
                  </div>
                  <button onClick={() => setEmbeddingKeyDraft(' ')} className="glass-sm rounded-lg px-3 py-2.5 text-xs text-ink-soft hover:bg-canvas-soft">Change</button>
                  <button onClick={() => save({ gemini_embedding_api_key: '' })} className="glass-sm rounded-lg px-3 py-2.5 text-xs text-critical hover:bg-critical/10">Remove</button>
                </div>
              )}
              {(!settings.gemini_embedding_api_key_set || embeddingKeyDraft) && (
                <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                  <div className="relative flex-1 min-w-[180px]">
                    <input
                      type={showEmbeddingKey ? 'text' : 'password'}
                      value={embeddingKeyDraft}
                      onChange={(e) => setEmbeddingKeyDraft(e.target.value)}
                      placeholder="Leave empty to reuse the primary Gemini key"
                      autoComplete="off"
                      className="w-full glass-sm rounded-lg px-3 py-2.5 pr-10 text-sm font-mono text-ink focus:outline-none focus:ring-2 focus:ring-accent/40"
                    />
                    <button type="button" onClick={() => setShowEmbeddingKey(!showEmbeddingKey)} className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink-soft">
                      {showEmbeddingKey ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                  <button
                    onClick={async () => {
                      await save({ gemini_embedding_api_key: embeddingKeyDraft.trim() });
                      setEmbeddingKeyDraft('');
                    }}
                    disabled={!embeddingKeyDraft.trim()}
                    className="glass-sm rounded-lg px-3 py-2.5 text-xs font-medium text-accent hover:bg-accent/8 disabled:opacity-50"
                  >Save</button>
                  {settings.gemini_embedding_api_key_set && (
                    <button onClick={() => setEmbeddingKeyDraft('')} className="glass-sm rounded-lg px-3 py-2.5 text-xs text-ink-mute hover:bg-canvas-soft">Cancel</button>
                  )}
                </div>
              )}
              <p className="text-[11px] text-ink-faint mt-1.5">
                Falls back to your primary Gemini key when empty. Set this only if you want embeddings on a separate quota.
              </p>
            </div>
          </div>
        )}

        {/* Ollama model selector */}
        {settings.embedding_provider === 'ollama' && (
          <div className="space-y-4">
            <div>
              <label className="text-xs text-ink-mute mb-1.5 block">Ollama Embedding Model</label>
              <div className="relative">
                <button
                  onClick={() => setOpenDropdown(openDropdown === 'ollama-embedding' ? null : 'ollama-embedding')}
                  className="w-full flex items-center justify-between glass-sm rounded-lg px-3 py-2.5 text-sm text-ink hover:ring-2 hover:ring-accent/40"
                >
                  <span className="font-medium">{settings.ollama_embedding_model || 'nomic-embed-text'}</span>
                  <ChevronDown size={14} className={`text-ink-faint transition-transform ${openDropdown === 'ollama-embedding' ? 'rotate-180' : ''}`} />
                </button>
                {openDropdown === 'ollama-embedding' && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="absolute z-30 mt-1 w-full glass-dropdown max-h-52 overflow-y-auto"
                  >
                    {ollamaEmbeddingOptions.map((model) => (
                      <button
                        key={model}
                        onClick={() => { save({ ollama_embedding_model: model }); setOpenDropdown(null); }}
                        className={`w-full text-left px-3 py-2 text-sm hover:bg-accent/8 ${
                          model === settings.ollama_embedding_model ? 'bg-accent/10 text-accent font-medium' : 'text-ink-soft'
                        }`}
                      >
                        {model}
                      </button>
                    ))}
                  </motion.div>
                )}
              </div>
              <p className="text-[11px] text-ink-faint mt-2">Requires Ollama running at the configured base URL. Model must be pulled locally.</p>
            </div>
            <div>
              <label className="text-xs text-ink-mute mb-1.5 block">Add Custom Model</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newEmbeddingModel}
                  onChange={(e) => setNewEmbeddingModel(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addCustomModel('custom_embedding_models', newEmbeddingModel, () => setNewEmbeddingModel(''))}
                  placeholder="e.g. bge-large"
                  className="flex-1 glass-sm rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
                />
                <button
                  onClick={() => addCustomModel('custom_embedding_models', newEmbeddingModel, () => setNewEmbeddingModel(''))}
                  className="glass-sm rounded-lg px-3 py-2 hover:bg-accent/8"
                >
                  <Plus size={16} className="text-accent" />
                </button>
              </div>
              {settings.custom_embedding_models.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {settings.custom_embedding_models.map((m) => (
                    <span key={m} className="inline-flex items-center gap-1 text-xs bg-ink/8 text-ink-soft px-2 py-1 rounded-full">
                      {m}
                      <button onClick={() => removeCustomModel('custom_embedding_models', m)} className="hover:text-critical">
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </GlassCard>

      {/* ── Shared: Temperature + Auto-run ───────────────── */}
      <GlassCard hover={false}>
        <div className="flex items-center gap-2 mb-5">
          <Timer size={18} className="text-accent" />
          <h2 className="text-sm font-semibold text-ink-soft">Agent Behaviour</h2>
        </div>

        {/* Per-agent temperatures */}
        <div className="mb-6">
          <div className="text-[11px] uppercase tracking-wide text-ink-faint mb-3">Per-agent Temperatures</div>
          <div className="grid md:grid-cols-2 gap-x-8 gap-y-5">
            {AGENT_TEMP_ROWS.map(({ key, label, hint }) => (
              <TempControl
                key={key}
                label={label}
                hint={hint}
                value={settings[key]}
                onLocalChange={(v) => setSettings({ ...settings, [key]: v })}
                onCommit={(v) => save({ [key]: v } as Partial<SettingsData>)}
              />
            ))}
          </div>
        </div>

        <div className="border-t border-ink/8 pt-5">
          <div className="text-[11px] uppercase tracking-wide text-ink-faint mb-3">Pipeline Execution</div>
          {/* Auto-run toggle */}
          <div>
            <label className="text-xs text-ink-mute mb-3 block">Automatic Pipeline Execution</label>
            <div
              onClick={() => save({ auto_run_pipeline: !settings.auto_run_pipeline })}
              className="flex items-center justify-between gap-4 glass-sm rounded-xl px-4 py-3 cursor-pointer hover:bg-canvas-soft"
            >
              <div className="text-left flex-1 min-w-0">
                <span className={`text-sm font-medium ${settings.auto_run_pipeline ? 'text-accent' : 'text-ink-soft'}`}>
                  {settings.auto_run_pipeline ? 'Enabled' : 'Disabled'}
                </span>
                <p className="text-[11px] text-ink-faint mt-0.5">
                  {settings.auto_run_pipeline
                    ? `Anomalies auto-run the pipeline; full sweep every ${settings.auto_run_interval_seconds}s`
                    : 'Monitoring only — no automatic incidents or pipelines'}
                </p>
              </div>
              <span
                role="switch"
                aria-checked={settings.auto_run_pipeline}
                className="toggle shrink-0"
                data-on={settings.auto_run_pipeline}
              >
                <span className="sr-only">Toggle Auto-Run</span>
                <span
                  aria-hidden="true"
                  className="toggle-thumb transition-transform duration-200 ease-in-out"
                  style={{ transform: settings.auto_run_pipeline ? 'translateX(16px)' : 'translateX(0)' }}
                />
              </span>
            </div>

            {/* Interval */}
            <div className="mt-3 flex items-center gap-3 flex-wrap">
              <input
                type="number"
                min={5}
                step={5}
                value={settings.auto_run_interval_seconds}
                onChange={(e) => {
                  const val = Math.max(5, parseInt(e.target.value) || 5);
                  setSettings({ ...settings, auto_run_interval_seconds: val });
                }}
                onBlur={(e) => save({ auto_run_interval_seconds: Math.max(5, parseInt(e.target.value) || 5) })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') save({ auto_run_interval_seconds: Math.max(5, parseInt((e.target as HTMLInputElement).value) || 5) });
                }}
                disabled={!settings.auto_run_pipeline}
                className={`w-24 glass-sm rounded-lg px-3 py-2 text-sm font-medium text-center focus:outline-none focus:ring-2 focus:ring-accent/40 ${
                  !settings.auto_run_pipeline ? 'opacity-50 cursor-not-allowed' : 'text-ink'
                }`}
              />
              <span className="text-sm text-ink-mute">seconds</span>
              <div className="flex gap-1.5 ml-auto flex-wrap">
                {[10, 30, 60, 120, 300].map((s) => (
                  <button
                    key={s}
                    onClick={() => save({ auto_run_interval_seconds: s })}
                    disabled={!settings.auto_run_pipeline}
                    className={`text-xs px-2 py-1 rounded-full ${
                      settings.auto_run_interval_seconds === s
                        ? 'bg-accent/12 text-accent font-medium'
                        : 'glass-sm text-ink-mute hover:bg-ink/8'
                    } ${!settings.auto_run_pipeline ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    {s < 60 ? `${s}s` : `${s / 60}m`}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </GlassCard>
    </motion.div>
  );
}
