import { useEffect, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { Check, Loader2 } from 'lucide-react';

/* The terminal types out one incident being resolved by the five agents —
   a sample run, the way a product screenshot is. It loops. */
type Line =
  | { kind: 'cmd'; text: string }
  | { kind: 'agent'; name: string; detail: string };

const SCRIPT: Line[] = [
  { kind: 'cmd',   text: 'itops watch --fleet' },
  { kind: 'agent', name: 'monitor',   detail: 'anomaly · api-gw-3 · mem 94%' },
  { kind: 'agent', name: 'predict',   detail: 'failure likely · ~6 min' },
  { kind: 'agent', name: 'diagnose',  detail: 'root cause · DB pool exhausted' },
  { kind: 'agent', name: 'remediate', detail: 'fix applied · rollback armed' },
  { kind: 'agent', name: 'report',    detail: 'resolved 2m 11s · runbook saved' },
];

const lineLen = (l: Line) => (l.kind === 'cmd' ? l.text.length : l.name.length + l.detail.length);

function Cursor() {
  return (
    <span
      className="lp-cursor ml-0.5 inline-block h-[0.95em] w-[7px] translate-y-[1px]"
      style={{ background: 'var(--lp-term-ink)' }}
      aria-hidden
    />
  );
}

export default function HeroTerminal() {
  const reduce = useReducedMotion();
  const [line, setLine] = useState(reduce ? SCRIPT.length : 0);
  const [n, setN] = useState(0);

  useEffect(() => {
    if (reduce) return;
    const cur = SCRIPT[line];
    let t: number;
    if (!cur) {
      t = window.setTimeout(() => { setLine(0); setN(0); }, 2800);     // hold, then loop
    } else if (n < lineLen(cur)) {
      t = window.setTimeout(() => setN((c) => c + 1), 18 + Math.random() * 22);
    } else {
      t = window.setTimeout(() => { setLine((i) => i + 1); setN(0); }, 380);
    }
    return () => clearTimeout(t);
  }, [line, n, reduce]);

  return (
    <figure className="m-0 w-full">
      {/* ── Screen ─────────────────────────────────────────────── */}
      <div
        className="overflow-hidden rounded-xl border border-[var(--lp-line-strong)] sm:rounded-2xl"
        style={{
          background: 'var(--lp-term-bg)',
          boxShadow: '0 40px 80px -32px rgba(20,22,18,0.55), 0 8px 24px -12px rgba(20,22,18,0.30)',
        }}
      >
        {/* label row — a title line, not OS chrome */}
        <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-2.5">
          <span className="font-mono text-[11px] tracking-wide text-[var(--lp-term-dim)]">
            itops · fleet watch
          </span>
          <span className="flex items-center gap-1.5 font-mono text-[10.5px] text-[var(--lp-term-green)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--lp-term-green)]" />
            live
          </span>
        </div>

        {/* terminal body — fixed height (no jump); long lines scroll, never wrap */}
        <div className="h-[176px] overflow-x-auto overflow-y-hidden px-4 py-3.5 font-mono text-[11px] leading-[1.8] [scrollbar-width:none] sm:h-[212px] sm:px-5 sm:py-4 sm:text-[13px] [&::-webkit-scrollbar]:hidden">
          {SCRIPT.map((l, i) => {
            if (!reduce && i > line) return null;
            const done = reduce || i < line;
            const typed = done ? lineLen(l) : n;
            const hasCursor = !reduce && (i === line || (line >= SCRIPT.length && i === SCRIPT.length - 1));

            if (l.kind === 'cmd') {
              return (
                <div key={i} className="flex items-center whitespace-pre">
                  <span className="text-[var(--lp-term-green)]">$ </span>
                  <span className="text-[var(--lp-term-ink)]">{l.text.slice(0, typed)}</span>
                  {hasCursor && <Cursor />}
                </div>
              );
            }
            const nameShown = l.name.slice(0, Math.min(typed, l.name.length));
            const detailShown = typed > l.name.length ? l.detail.slice(0, typed - l.name.length) : '';
            return (
              <div key={i} className="flex items-center whitespace-pre">
                <span className="inline-flex w-[18px] shrink-0 justify-start" aria-hidden>
                  {done
                    ? <Check size={13} className="text-[var(--lp-term-green)]" />
                    : <Loader2 size={12} className="animate-spin text-[var(--lp-term-dim)]" />}
                </span>
                <span className="text-[var(--lp-term-ink)]">{nameShown.padEnd(11)}</span>
                <span className="text-[var(--lp-term-dim)]">{detailShown}</span>
                {hasCursor && <Cursor />}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Stand ──────────────────────────────────────────────── */}
      <div
        className="mx-auto h-3.5 w-24"
        style={{
          background: 'linear-gradient(to bottom, var(--lp-line-strong), var(--lp-line))',
          clipPath: 'polygon(34% 0, 66% 0, 78% 100%, 22% 100%)',
        }}
      />
      <div className="mx-auto h-[6px] w-48 rounded-full bg-[var(--lp-line-strong)]" />

      <figcaption className="sr-only">
        A terminal showing the five ITOps agents detecting, diagnosing and resolving an incident.
      </figcaption>
    </figure>
  );
}
