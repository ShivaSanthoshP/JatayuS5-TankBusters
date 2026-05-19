import { useEffect, useMemo, useState } from 'react';
import { Download, FileCode2, TerminalSquare, Boxes } from 'lucide-react';

import type { RemediationArtifact } from '../../types';

interface ArtifactViewerProps {
  artifacts: RemediationArtifact[];
  title?: string;
  emptyLabel?: string;
  downloadUrlBuilder?: (artifact: RemediationArtifact) => string;
}

function triggerBrowserDownload(url: string, name: string) {
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function triggerTextDownload(content: string, name: string) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  triggerBrowserDownload(url, name);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function artifactAccent(artifact: RemediationArtifact) {
  if (artifact.kind === 'terraform') return 'text-info bg-info/10 border-info/20';
  if (artifact.purpose === 'rollback') return 'text-warning bg-warning/10 border-warning/20';
  return 'text-success bg-success/10 border-success/20';
}

function artifactIcon(artifact: RemediationArtifact) {
  if (artifact.kind === 'terraform') return Boxes;
  if (artifact.language === 'bash' || artifact.kind === 'shell') return TerminalSquare;
  return FileCode2;
}

export default function ArtifactViewer({
  artifacts,
  title = 'Generated Artifacts',
  emptyLabel = 'No remediation artifacts available.',
  downloadUrlBuilder,
}: ArtifactViewerProps) {
  const normalizedArtifacts = useMemo(
    () => artifacts.filter((artifact) => Boolean(artifact?.content)),
    [artifacts],
  );

  const [selectedId, setSelectedId] = useState<string | null>(normalizedArtifacts[0]?.id ?? null);

  useEffect(() => {
    if (!normalizedArtifacts.length) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedId(null);
      return;
    }
    if (!selectedId || !normalizedArtifacts.some((artifact) => artifact.id === selectedId)) {
      setSelectedId(normalizedArtifacts[0].id);
    }
  }, [normalizedArtifacts, selectedId]);

  const selected = normalizedArtifacts.find((artifact) => artifact.id === selectedId) ?? normalizedArtifacts[0];

  const handleDownload = (artifact: RemediationArtifact) => {
    if (downloadUrlBuilder) {
      triggerBrowserDownload(downloadUrlBuilder(artifact), artifact.name);
      return;
    }
    triggerTextDownload(artifact.content, artifact.name);
  };

  if (!normalizedArtifacts.length) {
    return (
      <div className="glass-sm p-4 text-xs text-ink-faint">
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className="glass-sm p-4 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-ink-soft">{title}</h3>
          <p className="text-xs text-ink-faint mt-1">
            Review generated shell and Terraform remediation artifacts before applying them.
          </p>
        </div>
        <span className="text-xs text-ink-faint">
          {normalizedArtifacts.length} file{normalizedArtifacts.length === 1 ? '' : 's'}
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        {normalizedArtifacts.map((artifact) => {
          const Icon = artifactIcon(artifact);
          const selectedClass = artifact.id === selected?.id
            ? 'border-accent/40 bg-accent/10 text-accent'
            : 'border-hairline-strong bg-surface/50 text-ink-mute hover:border-accent/20';

          return (
            <button
              key={artifact.id}
              onClick={() => setSelectedId(artifact.id)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-colors ${selectedClass}`}
            >
              <Icon size={13} />
              <span>{artifact.name}</span>
            </button>
          );
        })}
      </div>

      {selected && (
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                <span className={`inline-flex items-center px-2.5 py-1 rounded-full border text-[11px] font-medium ${artifactAccent(selected)}`}>
                  {selected.kind}
                </span>
                <span className="inline-flex items-center px-2.5 py-1 rounded-full border border-hairline-strong text-[11px] font-medium text-ink-mute bg-surface/60">
                  {selected.purpose}
                </span>
                <span className="inline-flex items-center px-2.5 py-1 rounded-full border border-hairline-strong text-[11px] font-medium text-ink-mute bg-surface/60">
                  {selected.language}
                </span>
              </div>
              {selected.description && (
                <p className="text-xs text-ink-mute leading-relaxed">
                  {selected.description}
                </p>
              )}
            </div>

            <button
              onClick={() => handleDownload(selected)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-accent text-white text-xs font-medium hover:bg-accent-bright transition-colors shrink-0"
            >
              <Download size={12} />
              Download
            </button>
          </div>

          <pre className="terminal-pane text-xs rounded-xl p-4 overflow-x-auto max-h-[420px] leading-5 border border-white/5">
            <code>{selected.content}</code>
          </pre>
        </div>
      )}
    </div>
  );
}
