import { useCallback } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft, AlertTriangle, BookOpen, Hash, Loader2, Pencil, Trash2,
} from 'lucide-react';
import RunbookDetailBody from '../components/runbooks/RunbookDetailBody';
import { runbookDraft } from '../hooks/useRunbookDraft';
import { usePolling } from '../hooks/useApi';
import * as api from '../services/api';
import type { RunbookEntry } from '../types';

/**
 * Full-page runbook view. Long-Document macrostructure: back link, big
 * display title, quiet meta row carrying badges + source incident,
 * Edit / Delete actions, then the existing detail body. There's no
 * single-runbook backend endpoint yet, so we read from the list (which
 * the page polls every 15s) and pick by :id.
 */
export default function RunbookDetail() {
  const { id: idParam } = useParams<{ id: string }>();
  const idNum = Number(idParam);
  const validId = Number.isFinite(idNum) && idNum > 0;

  const navigate = useNavigate();
  const { data: runbooks, loading, refetch } = usePolling<RunbookEntry[]>(api.getRunbooks, 15000);
  const list = runbooks ?? [];
  const rb = validId ? list.find((r) => r.id === idNum) ?? null : null;

  const handleDelete = useCallback(async () => {
    if (!rb) return;
    if (!confirm(`Delete runbook "${rb.title}"?\n\nThis permanently removes it from the database and the search index.`)) return;
    try {
      await api.deleteRunbook(rb.id);
      navigate('/runbooks');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      alert(`Delete failed: ${msg}`);
    }
  }, [rb, navigate]);

  const handleEdit = useCallback(() => {
    if (!rb) return;
    runbookDraft.openEntry(rb);
    // Re-fetch when the modal saves so updated fields show on this page.
    const onChanged = () => { refetch(); window.removeEventListener('itops:runbooks-changed', onChanged); };
    window.addEventListener('itops:runbooks-changed', onChanged);
  }, [rb, refetch]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: [0.32, 0.72, 0, 1] }}
      className="max-w-[920px] xl:max-w-[1320px] mx-auto"
    >
      <Link
        to="/runbooks"
        className="inline-flex items-center gap-1.5 text-[12px] text-ink-mute
          hover:text-ink transition-colors
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40
          rounded"
      >
        <ArrowLeft size={13} />
        All runbooks
      </Link>

      {loading && !runbooks && (
        <div className="mt-12 flex items-center gap-2 text-sm text-ink-mute">
          <Loader2 size={14} className="animate-spin" />
          Loading runbook…
        </div>
      )}

      {!loading && rb === null && (
        <div className="mt-16 max-w-md">
          <div className="flex items-center gap-2 text-warning mb-2">
            <AlertTriangle size={18} />
            <h1 className="font-display text-[20px] text-ink">Runbook not found</h1>
          </div>
          <p className="text-sm text-ink-mute">
            No runbook exists at this id, or it was deleted.
          </p>
        </div>
      )}

      {rb && (
        <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_320px] xl:gap-12 xl:items-start">
          <main className="min-w-0">
            <header className="mt-6 pb-6 border-b border-glass-border">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center shrink-0 mt-1">
                  <BookOpen size={18} className="text-accent" />
                </div>
                <div className="min-w-0 flex-1">
                  <h1 className="font-display text-[26px] sm:text-[30px] lg:text-[34px] leading-tight text-ink">
                    {rb.title}
                  </h1>

                  {/* Inline meta — only on <xl. On xl+ the sidebar carries this. */}
                  <div className="xl:hidden mt-3 flex flex-wrap items-center gap-x-2 gap-y-2 text-[12px] sm:text-[13px] text-ink-faint">
                    {rb.is_seeded ? (
                      <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-info/12 text-info border border-info/25">
                        Seeded
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-success/12 text-success border border-success/25">
                        Learned
                      </span>
                    )}
                    {rb.issue_type && (
                      <span className="text-[11px] px-1.5 py-0.5 rounded bg-ink/8 text-ink-soft font-mono">
                        {rb.issue_type.replace(/_/g, ' ')}
                      </span>
                    )}
                    {rb.source_incident_id != null && (
                      <>
                        <Dot />
                        <Link
                          to={`/incidents/${rb.source_incident_id}`}
                          className="inline-flex items-center gap-1 hover:text-ink transition-colors"
                        >
                          <Hash size={10} />
                          Incident {rb.source_incident_id}
                        </Link>
                      </>
                    )}
                    {rb.created_at && (
                      <>
                        <Dot />
                        <span>Added {new Date(rb.created_at).toLocaleDateString()}</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Inline actions — only on <xl. On xl+ the sidebar carries these. */}
                <div className="xl:hidden flex items-center gap-1 shrink-0">
                  <button
                    onClick={handleEdit}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-glass-border text-[12px] font-medium text-ink-soft hover:bg-accent/5 hover:border-accent/30 transition-colors"
                  >
                    <Pencil size={12} /> Edit
                  </button>
                  <button
                    onClick={handleDelete}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-glass-border text-[12px] font-medium text-critical/80 hover:bg-critical/8 hover:border-critical/30 transition-colors"
                  >
                    <Trash2 size={12} /> Delete
                  </button>
                </div>
              </div>
            </header>

            <div className="pt-8 pb-16">
              <RunbookDetailBody runbook={rb} />
            </div>
          </main>

          {/* Sidebar — appears only on xl+. */}
          <aside className="hidden xl:block xl:sticky xl:top-[120px] xl:self-start xl:mt-6">
            <div className="glass-mica rounded-2xl p-5 space-y-5">
              <div className="flex flex-wrap items-center gap-1.5">
                {rb.is_seeded ? (
                  <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-info/12 text-info border border-info/25">
                    Seeded
                  </span>
                ) : (
                  <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-success/12 text-success border border-success/25">
                    Learned
                  </span>
                )}
                {rb.issue_type && (
                  <span className="text-[11px] px-1.5 py-0.5 rounded bg-ink/8 text-ink-soft font-mono">
                    {rb.issue_type.replace(/_/g, ' ')}
                  </span>
                )}
              </div>

              <Divider />

              {rb.source_incident_id != null && (
                <Field label="Source">
                  <Link
                    to={`/incidents/${rb.source_incident_id}`}
                    className="inline-flex items-center gap-1 text-accent hover:underline"
                  >
                    <Hash size={11} />
                    Incident {rb.source_incident_id}
                  </Link>
                </Field>
              )}
              {rb.created_at && (
                <Field label="Added">
                  {new Date(rb.created_at).toLocaleDateString()}
                </Field>
              )}

              <Divider />

              <div className="flex gap-2">
                <button
                  onClick={handleEdit}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-glass-border text-[12px] font-medium text-ink-soft hover:bg-accent/5 hover:border-accent/30 transition-colors"
                >
                  <Pencil size={12} /> Edit
                </button>
                <button
                  onClick={handleDelete}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-glass-border text-[12px] font-medium text-critical/80 hover:bg-critical/8 hover:border-critical/30 transition-colors"
                >
                  <Trash2 size={12} /> Delete
                </button>
              </div>
            </div>
          </aside>
        </div>
      )}
    </motion.div>
  );
}

function Dot() {
  return <span className="text-ink-faint/50">·</span>;
}

function Divider() {
  return <div className="h-px bg-glass-border" />;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] text-ink-faint font-medium">{label}</div>
      <div className="mt-1 text-[13px] text-ink-soft leading-snug">{children}</div>
    </div>
  );
}

