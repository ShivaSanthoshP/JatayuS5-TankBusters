import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Settings as SettingsIcon, Brain, Cpu, Timer, Plus, X, Check,
  RefreshCw, ChevronDown, Loader2,
} from 'lucide-react';
import GlassCard from '../components/ui/GlassCard';
import * as api from '../services/api';

interface SettingsData {
  ollama_model: string;
  ollama_embedding_model: string;
  ollama_base_url: string;
  agent_temperature: number;
  custom_llm_models: string[];
  custom_embedding_models: string[];
  auto_run_pipeline: boolean;
  auto_run_interval_seconds: number;
}

interface OllamaModel {
  name: string;
  size: number;
  modified_at: string;
}

const DEFAULT_LLM_OPTIONS = [
  'llama3.2:3b',
  'qwen2.5-coder:7b',
  'mistral-nemo',
  'deepseek-coder-v2',
  'codellama:7b',
  'gemma2:9b',
];

const DEFAULT_EMBEDDING_OPTIONS = [
  'nomic-embed-text',
  'mxbai-embed-large',
  'all-minilm',
  'snowflake-arctic-embed',
];

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

export default function Settings() {
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [ollamaModels, setOllamaModels] = useState<OllamaModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newLlmModel, setNewLlmModel] = useState('');
  const [newEmbeddingModel, setNewEmbeddingModel] = useState('');
  const [showLlmDropdown, setShowLlmDropdown] = useState(false);
  const [showEmbeddingDropdown, setShowEmbeddingDropdown] = useState(false);

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

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

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

  const addCustomModel = (type: 'llm' | 'embedding') => {
    if (!settings) return;
    const value = type === 'llm' ? newLlmModel.trim() : newEmbeddingModel.trim();
    if (!value) return;

    const key = type === 'llm' ? 'custom_llm_models' : 'custom_embedding_models';
    const existing = settings[key];
    if (existing.includes(value)) return;

    const updated = [...existing, value];
    save({ [key]: updated });
    if (type === 'llm') setNewLlmModel('');
    else setNewEmbeddingModel('');
  };

  const removeCustomModel = (type: 'llm' | 'embedding', model: string) => {
    if (!settings) return;
    const key = type === 'llm' ? 'custom_llm_models' : 'custom_embedding_models';
    const updated = settings[key].filter(m => m !== model);
    save({ [key]: updated });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-emerald-500" />
        <span className="ml-3 text-slate-500">Loading settings...</span>
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <p className="text-red-400 text-sm">Failed to load settings: {error}</p>
        <button onClick={fetchSettings} className="text-emerald-600 text-sm underline">Retry</button>
      </div>
    );
  }

  // Build dropdown options: installed Ollama models + defaults + custom
  const installedModelNames = ollamaModels.map(m => m.name);
  const isInstalled = (model: string) => installedModelNames.some(name => name === model || name === `${model}:latest`);

  const sortByInstalled = (a: string, b: string) => {
    const aInstalled = isInstalled(a);
    const bInstalled = isInstalled(b);
    if (aInstalled && !bInstalled) return -1;
    if (!aInstalled && bInstalled) return 1;
    return a.localeCompare(b);
  };

  const llmOptions = [...new Set([
    ...installedModelNames,
    ...DEFAULT_LLM_OPTIONS,
    ...settings.custom_llm_models,
    settings.ollama_model,
  ])].sort(sortByInstalled);

  const embeddingOptions = [...new Set([
    ...DEFAULT_EMBEDDING_OPTIONS,
    ...settings.custom_embedding_models,
    settings.ollama_embedding_model,
  ])].sort(sortByInstalled);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <SettingsIcon size={24} className="text-emerald-600" />
            Settings
          </h1>
          <p className="text-sm text-slate-500 mt-1">Configure models, pipeline behaviour, and runtime options</p>
        </div>
        <div className="flex items-center gap-3">
          {saved && (
            <motion.span
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              className="text-xs text-emerald-600 flex items-center gap-1"
            >
              <Check size={14} /> Saved
            </motion.span>
          )}
          {saving && <Loader2 size={14} className="animate-spin text-emerald-500" />}
          <button
            onClick={fetchSettings}
            className="glass-sm p-2 rounded-lg hover:bg-emerald-50 transition-colors"
            title="Refresh"
          >
            <RefreshCw size={16} className="text-slate-500" />
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-600">
          {error}
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        {/* ── LLM Model ─────────────────────────────────────── */}
        <GlassCard hover={false}>
          <div className="flex items-center gap-2 mb-5">
            <Brain size={18} className="text-emerald-600" />
            <h2 className="text-sm font-semibold text-slate-700">LLM Model (Agents)</h2>
          </div>

          <label className="text-xs text-slate-500 mb-1.5 block">Active Model</label>
          <div className="relative mb-4">
            <button
              onClick={() => { setShowLlmDropdown(!showLlmDropdown); setShowEmbeddingDropdown(false); }}
              className="w-full flex items-center justify-between glass-sm rounded-lg px-3 py-2.5 text-sm text-slate-800 hover:ring-2 hover:ring-emerald-300 transition-all"
            >
              <span className="font-medium">{settings.ollama_model}</span>
              <ChevronDown size={14} className={`text-slate-400 transition-transform ${showLlmDropdown ? 'rotate-180' : ''}`} />
            </button>
            {showLlmDropdown && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="absolute z-30 mt-1 w-full glass-dropdown max-h-52 overflow-y-auto"
              >
                {llmOptions.map(model => (
                  <button
                    key={model}
                    onClick={() => { save({ ollama_model: model }); setShowLlmDropdown(false); }}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-emerald-50 transition-colors flex items-center justify-between ${model === settings.ollama_model ? 'bg-emerald-50 text-emerald-700 font-medium' : 'text-slate-700'
                      }`}
                  >
                    <span>{model}</span>
                    {isInstalled(model) && (
                      <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full">installed</span>
                    )}
                  </button>
                ))}
              </motion.div>
            )}
          </div>

          {/* Add custom model */}
          <label className="text-xs text-slate-500 mb-1.5 block">Add Custom Model</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={newLlmModel}
              onChange={e => setNewLlmModel(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addCustomModel('llm')}
              placeholder="e.g. phi3:mini"
              className="flex-1 glass-sm rounded-lg px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-300"
            />
            <button
              onClick={() => addCustomModel('llm')}
              className="glass-sm rounded-lg px-3 py-2 hover:bg-emerald-50 transition-colors"
            >
              <Plus size={16} className="text-emerald-600" />
            </button>
          </div>

          {/* Custom models list */}
          {settings.custom_llm_models.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {settings.custom_llm_models.map(m => (
                <span key={m} className="inline-flex items-center gap-1 text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded-full">
                  {m}
                  <button onClick={() => removeCustomModel('llm', m)} className="hover:text-red-500">
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Installed models from Ollama */}
          {ollamaModels.length > 0 && (
            <div className="mt-5">
              <label className="text-xs text-slate-500 mb-2 block">Installed on Ollama Server</label>
              <div className="space-y-1">
                {ollamaModels.map(m => (
                  <div key={m.name} className="flex items-center justify-between text-xs text-slate-600 glass-sm rounded-lg px-3 py-1.5">
                    <span className="font-medium">{m.name}</span>
                    <span className="text-slate-400">{formatBytes(m.size)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </GlassCard>

        {/* ── Embedding Model ───────────────────────────────── */}
        <GlassCard hover={false}>
          <div className="flex items-center gap-2 mb-5">
            <Cpu size={18} className="text-emerald-600" />
            <h2 className="text-sm font-semibold text-slate-700">Embedding Model (RAG)</h2>
          </div>

          <label className="text-xs text-slate-500 mb-1.5 block">Active Embedding Model</label>
          <div className="relative mb-4">
            <button
              onClick={() => { setShowEmbeddingDropdown(!showEmbeddingDropdown); setShowLlmDropdown(false); }}
              className="w-full flex items-center justify-between glass-sm rounded-lg px-3 py-2.5 text-sm text-slate-800 hover:ring-2 hover:ring-emerald-300 transition-all"
            >
              <span className="font-medium">{settings.ollama_embedding_model}</span>
              <ChevronDown size={14} className={`text-slate-400 transition-transform ${showEmbeddingDropdown ? 'rotate-180' : ''}`} />
            </button>
            {showEmbeddingDropdown && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="absolute z-30 mt-1 w-full glass-dropdown max-h-52 overflow-y-auto"
              >
                {embeddingOptions.map(model => (
                  <button
                    key={model}
                    onClick={() => { save({ ollama_embedding_model: model }); setShowEmbeddingDropdown(false); }}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-emerald-50 transition-colors flex items-center justify-between ${model === settings.ollama_embedding_model ? 'bg-emerald-50 text-emerald-700 font-medium' : 'text-slate-700'
                      }`}
                  >
                    <span>{model}</span>
                    {isInstalled(model) && (
                      <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full">installed</span>
                    )}
                  </button>
                ))}
              </motion.div>
            )}
          </div>

          {/* Add custom embedding model */}
          <label className="text-xs text-slate-500 mb-1.5 block">Add Custom Embedding Model</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={newEmbeddingModel}
              onChange={e => setNewEmbeddingModel(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addCustomModel('embedding')}
              placeholder="e.g. bge-large"
              className="flex-1 glass-sm rounded-lg px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-300"
            />
            <button
              onClick={() => addCustomModel('embedding')}
              className="glass-sm rounded-lg px-3 py-2 hover:bg-emerald-50 transition-colors"
            >
              <Plus size={16} className="text-emerald-600" />
            </button>
          </div>

          {settings.custom_embedding_models.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {settings.custom_embedding_models.map(m => (
                <span key={m} className="inline-flex items-center gap-1 text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded-full">
                  {m}
                  <button onClick={() => removeCustomModel('embedding', m)} className="hover:text-red-500">
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Temperature slider */}
          <div className="mt-6">
            <label className="text-xs text-slate-500 mb-1.5 block">
              Agent Temperature: <span className="font-medium text-slate-700">{settings.agent_temperature}</span>
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={settings.agent_temperature}
              onChange={e => {
                const val = parseFloat(e.target.value);
                setSettings({ ...settings, agent_temperature: val });
              }}
              onMouseUp={e => save({ agent_temperature: parseFloat((e.target as HTMLInputElement).value) })}
              onTouchEnd={e => save({ agent_temperature: parseFloat((e.target as HTMLInputElement).value) })}
              className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-emerald-600"
            />
            <div className="flex justify-between text-[10px] text-slate-400 mt-1">
              <span>0 (Precise)</span>
              <span>1 (Creative)</span>
            </div>
          </div>
        </GlassCard>

        {/* ── Auto Pipeline ─────────────────────────────────── */}
        <GlassCard hover={false} className="lg:col-span-2">
          <div className="flex items-center gap-2 mb-5">
            <Timer size={18} className="text-emerald-600" />
            <h2 className="text-sm font-semibold text-slate-700">Automatic Pipeline Execution</h2>
          </div>

          <div className="grid sm:grid-cols-2 gap-6">
            {/* Toggle */}
            <div>
              <label className="text-xs text-slate-500 mb-3 block">
                Controls whether anomalies automatically create incidents and whether the periodic full-fleet pipeline sweep runs
              </label>
              <div
                onClick={() => save({ auto_run_pipeline: !settings.auto_run_pipeline })}
                className={`flex items-center justify-between gap-4 glass-sm rounded-xl px-4 py-3 transition-all w-full cursor-pointer hover:bg-slate-50`}
              >
                <div className="text-left flex-1 min-w-0">
                  <span className={`text-sm font-medium ${settings.auto_run_pipeline ? 'text-emerald-700' : 'text-slate-600'}`}>
                    {settings.auto_run_pipeline ? 'Enabled' : 'Disabled'}
                  </span>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {settings.auto_run_pipeline
                      ? `Anomalies auto-run the pipeline, and a full sweep runs every ${settings.auto_run_interval_seconds}s`
                      : 'Monitoring still updates node health, but no automatic pipeline runs or incident creation occur'}
                  </p>
                </div>

                <button
                  type="button"
                  role="switch"
                  aria-checked={settings.auto_run_pipeline}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 ${settings.auto_run_pipeline ? 'bg-emerald-500' : 'bg-red-500'
                    }`}
                >
                  <span className="sr-only">Toggle Auto-Run</span>
                  <span
                    aria-hidden="true"
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${settings.auto_run_pipeline ? 'translate-x-5' : 'translate-x-0'
                      }`}
                  />
                </button>
              </div>
            </div>

            {/* Timer */}
            <div>
              <label className="text-xs text-slate-500 mb-3 block">
                Periodic full-sweep interval (seconds) — minimum 5s
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min={5}
                  step={5}
                  value={settings.auto_run_interval_seconds}
                  onChange={e => {
                    const val = Math.max(5, parseInt(e.target.value) || 5);
                    setSettings({ ...settings, auto_run_interval_seconds: val });
                  }}
                  onBlur={e => {
                    const val = Math.max(5, parseInt(e.target.value) || 5);
                    save({ auto_run_interval_seconds: val });
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      const val = Math.max(5, parseInt((e.target as HTMLInputElement).value) || 5);
                      save({ auto_run_interval_seconds: val });
                    }
                  }}
                  disabled={!settings.auto_run_pipeline}
                  className={`w-28 glass-sm rounded-lg px-3 py-2.5 text-sm font-medium text-center focus:outline-none focus:ring-2 focus:ring-emerald-300 ${!settings.auto_run_pipeline ? 'opacity-50 cursor-not-allowed' : 'text-slate-800'
                    }`}
                />
                <span className="text-sm text-slate-500">seconds</span>
              </div>

              {/* Quick presets */}
              <div className="flex gap-2 mt-3">
                {[10, 30, 60, 120, 300].map(s => (
                  <button
                    key={s}
                    onClick={() => {
                      setSettings({ ...settings, auto_run_interval_seconds: s });
                      save({ auto_run_interval_seconds: s });
                    }}
                    disabled={!settings.auto_run_pipeline}
                    className={`text-xs px-2.5 py-1 rounded-full transition-colors ${settings.auto_run_interval_seconds === s
                      ? 'bg-emerald-100 text-emerald-700 font-medium'
                      : 'glass-sm text-slate-500 hover:bg-slate-100'
                      } ${!settings.auto_run_pipeline ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    {s < 60 ? `${s}s` : `${s / 60}m`}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </GlassCard>

        {/* ── Ollama Connection ──────────────────────────────── */}
        <GlassCard hover={false} className="lg:col-span-2">
          <div className="flex items-center gap-2 mb-4">
            <RefreshCw size={18} className="text-emerald-600" />
            <h2 className="text-sm font-semibold text-slate-700">Ollama Server</h2>
          </div>
          <div className="flex items-center gap-3">
            <label className="text-xs text-slate-500 shrink-0">Base URL</label>
            <input
              type="text"
              value={settings.ollama_base_url}
              onChange={e => setSettings({ ...settings, ollama_base_url: e.target.value })}
              onBlur={e => save({ ollama_base_url: e.target.value.trim() })}
              onKeyDown={e => { if (e.key === 'Enter') save({ ollama_base_url: (e.target as HTMLInputElement).value.trim() }); }}
              className="flex-1 glass-sm rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-300"
            />
            <button
              onClick={fetchSettings}
              className="glass-sm rounded-lg px-3 py-2 hover:bg-emerald-50 transition-colors text-xs text-emerald-600 font-medium"
            >
              Test Connection
            </button>
          </div>
          <p className="text-[11px] text-slate-400 mt-2">
            {ollamaModels.length > 0
              ? `Connected — ${ollamaModels.length} model${ollamaModels.length > 1 ? 's' : ''} available`
              : 'Unable to reach Ollama server. Make sure it is running.'}
          </p>
        </GlassCard>
      </div>
    </motion.div>
  );
}
