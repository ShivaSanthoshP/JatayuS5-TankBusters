import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Push-to-talk speech-to-text via the browser's Web Speech API.
 *
 * Surfaces:
 * - A live audio-level meter (5 bars from an FFT analyser) so the UI can
 *   show a waveform while listening.
 * - A rolling `transcript` string — committed finals + the current interim —
 *   updated on every partial result so consumers can mirror it into a
 *   textbox in real time, ChatGPT-style.
 * - `functional` reports whether the API is actually usable in this browser.
 *   False in Firefox (no API) and in Brave (API present but Google STT is
 *   stripped, so it returns `network` immediately). The UI degrades cleanly
 *   instead of silently failing.
 * - `permission` exposes the OS-level microphone permission state, with
 *   live updates from the Permissions API where supported.
 */

const BAR_COUNT = 5;
const BROKEN_FLAG_KEY = 'webspeech:broken';

type Status = 'idle' | 'listening' | 'error';
type PermissionStateLike = 'granted' | 'denied' | 'prompt' | 'unknown';

interface UseVoiceInputOpts {
  lang?: string;
  /** Fired on every partial result with the live, unpolished transcript
   *  (committed finals + current interim) — drive word-by-word streaming into
   *  a textbox from here. */
  onTranscript?: (text: string) => void;
  onFinal: (text: string) => void;
}

interface UseVoiceInput {
  status: Status;
  bars: number[];
  interim: string;
  supported: boolean;
  /** True only if the API exists AND is believed to actually work here.
   *  False in Firefox, Brave, and after a `network` failure this session. */
  functional: boolean;
  permission: PermissionStateLike;
  error: string | null;
  start: () => Promise<void>;
  stop: () => void;
}

// ── Vendor Web Speech API types (not in lib.dom.d.ts) ──
type SRAlternative = { transcript: string; confidence: number };
type SRResult = ArrayLike<SRAlternative> & { isFinal: boolean };
type SREvent = { resultIndex: number; results: ArrayLike<SRResult> };
interface SR {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onresult: ((e: SREvent) => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}
type SRCtor = new () => SR;

function getSRCtor(): SRCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: SRCtor; webkitSpeechRecognition?: SRCtor };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

/** Brave exposes navigator.brave.isBrave() specifically so apps can detect it. */
async function detectBrave(): Promise<boolean> {
  const nav = navigator as unknown as { brave?: { isBrave?: () => Promise<boolean> } };
  if (!nav.brave?.isBrave) return false;
  try { return await nav.brave.isBrave(); } catch { return false; }
}

function getBrokenFlag(): boolean {
  try { return sessionStorage.getItem(BROKEN_FLAG_KEY) === '1'; } catch { return false; }
}
function setBrokenFlag(): void {
  try { sessionStorage.setItem(BROKEN_FLAG_KEY, '1'); } catch { /* private mode */ }
}

/** Pick the highest-confidence alternative — beats blindly taking #1. */
function pickBest(r: SRResult): string {
  let best = r[0];
  for (let k = 1; k < r.length; k++) {
    const c = r[k].confidence ?? 0;
    if (c > (best.confidence ?? 0)) best = r[k];
  }
  return best.transcript;
}

// Domain post-processing — fixes the SRE/DevOps/AWS terms the Web Speech
// recognizer most reliably mishears, especially on Indian English. Each
// pattern is anchored on word boundaries to avoid rewriting unrelated text.
const TECH_FIXES: Array<[RegExp, string]> = [
  // CLI / orchestration
  [/\b(?:cube|kube)[ -]?(?:control|cuddle|c\s*t\s*l)\b/gi, 'kubectl'],
  [/\bkuber[ -]?net(?:is|tis|ties|es)?\b/gi, 'kubernetes'],

  // AWS services (acronyms commonly read out letter-by-letter)
  [/\b(?:ec|easy)[ -]?two\b/gi, 'EC2'],
  [/\bs[ -]?(?:three|free)\b/gi, 'S3'],
  [/\b(?:i[ -]?a[ -]?m|i\.a\.m\.)\b/gi, 'IAM'],
  [/\br[ -]?d[ -]?s\b/gi, 'RDS'],
  [/\be[ -]?k[ -]?s\b/gi, 'EKS'],
  [/\be[ -]?c[ -]?s\b/gi, 'ECS'],
  [/\bs[ -]?q[ -]?s\b/gi, 'SQS'],
  [/\bs[ -]?n[ -]?s\b/gi, 'SNS'],
  [/\bv[ -]?p[ -]?c\b/gi, 'VPC'],
  [/\bcloud[ -]?watch\b/gi, 'CloudWatch'],
  [/\bcloud[ -]?formation\b/gi, 'CloudFormation'],
  [/\bcloud[ -]?front\b/gi, 'CloudFront'],
  [/\bcloud[ -]?trail\b/gi, 'CloudTrail'],
  [/\bdynamo[ -]?d[ -]?b\b/gi, 'DynamoDB'],
  [/\bdynamo[ -]?db\b/gi, 'DynamoDB'],
  [/\blambda\b/gi, 'Lambda'],

  // Observability
  [/\bdata[ -]?dog\b/gi, 'Datadog'],
  [/\bpager[ -]?duty\b/gi, 'PagerDuty'],
  [/\bgraph[ -]?fana\b/gi, 'Grafana'],
  [/\bgrafana\b/gi, 'Grafana'],
  [/\bprometheus\b/gi, 'Prometheus'],
  [/\bsentry\b/gi, 'Sentry'],
  [/\bsplunk\b/gi, 'Splunk'],
  [/\bnew[ -]?relic\b/gi, 'New Relic'],
  [/\bopen[ -]?telemetry\b/gi, 'OpenTelemetry'],
  [/\bloki\b/gi, 'Loki'],

  // Data
  [/\belastic[ -]?search\b/gi, 'Elasticsearch'],
  [/\bela[ -]?stick[ -]?search\b/gi, 'Elasticsearch'],
  [/\bmongo[ -]?d[ -]?b\b/gi, 'MongoDB'],
  [/\bmongo[ -]?db\b/gi, 'MongoDB'],
  [/\bpost[ -]?gres(?:ql)?\b/gi, 'Postgres'],
  [/\bpost[ -]?grass\b/gi, 'Postgres'],
  [/\bredis\b/gi, 'Redis'],
  [/\bcassandra\b/gi, 'Cassandra'],
  [/\bkafka\b/gi, 'Kafka'],

  // CI/CD & IaC
  [/\bargo[ -]?cd\b/gi, 'ArgoCD'],
  [/\bspinnaker\b/gi, 'Spinnaker'],
  [/\bjenkins\b/gi, 'Jenkins'],
  [/\bterra[ -]?form\b/gi, 'Terraform'],
  [/\bhelm\b/gi, 'Helm'],
  [/\bistio\b/gi, 'Istio'],
  [/\blinkerd\b/gi, 'Linkerd'],

  // App-specific
  [/\bargus\b/gi, 'Argus'],
];

function polish(text: string): string {
  let out = text;
  for (const [re, sub] of TECH_FIXES) out = out.replace(re, sub);
  return out.replace(/\s+/g, ' ').replace(/\s+([.,!?;:])/g, '$1').trim();
}

export function useVoiceInput(opts: UseVoiceInputOpts): UseVoiceInput {
  const { lang = 'en-IN', onTranscript, onFinal } = opts;
  const [status, setStatus] = useState<Status>('idle');
  const [bars, setBars] = useState<number[]>(() => new Array(BAR_COUNT).fill(0));
  const [interim, setInterim] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [permission, setPermission] = useState<PermissionStateLike>('unknown');

  const supported = !!getSRCtor();
  const [functional, setFunctional] = useState<boolean>(() => {
    if (!supported) return false;
    if (getBrokenFlag()) return false;
    return true; // optimistic — Brave check below may flip this
  });

  const recRef = useRef<SR | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef(0);
  const finalTextRef = useRef('');
  const interimTextRef = useRef('');
  const onFinalRef = useRef(onFinal);
  useEffect(() => { onFinalRef.current = onFinal; }, [onFinal]);
  const onTranscriptRef = useRef(onTranscript);
  useEffect(() => { onTranscriptRef.current = onTranscript; }, [onTranscript]);

  // ── Brave detection (preemptive — avoids the wasted-click failure) ──
  useEffect(() => {
    let cancelled = false;
    void detectBrave().then((isBrave) => {
      if (!cancelled && isBrave) setFunctional(false);
    });
    return () => { cancelled = true; };
  }, []);

  // ── Microphone permission state, live-updated where supported ──
  useEffect(() => {
    type PermStatus = {
      state: PermissionStateLike;
      addEventListener?: (type: string, listener: () => void) => void;
      removeEventListener?: (type: string, listener: () => void) => void;
      onchange?: (() => void) | null;
    };
    const nav = navigator as unknown as {
      permissions?: { query: (descriptor: { name: string }) => Promise<PermStatus> };
    };
    if (!nav.permissions?.query) return;
    let cancelled = false;
    let status: PermStatus | null = null;
    const onChange = () => { if (!cancelled && status) setPermission(status.state); };
    nav.permissions.query({ name: 'microphone' }).then((s) => {
      if (cancelled) return;
      status = s;
      setPermission(s.state);
      if (s.addEventListener) s.addEventListener('change', onChange);
      else s.onchange = onChange;
    }).catch(() => { /* Permissions API doesn't support 'microphone' here */ });
    return () => {
      cancelled = true;
      if (status?.removeEventListener) status.removeEventListener('change', onChange);
    };
  }, []);

  const teardown = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    const rec = recRef.current;
    if (rec) {
      rec.onstart = null;
      rec.onresult = null;
      rec.onerror = null;
      rec.onend = null;
      recRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    setBars(new Array(BAR_COUNT).fill(0));
  }, []);

  const stop = useCallback(() => {
    try { recRef.current?.stop(); } catch { /* not running */ }
  }, []);

  const start = useCallback(async () => {
    if (status === 'listening') return;
    const Ctor = getSRCtor();
    if (!Ctor) { setError('not_supported'); setStatus('error'); return; }
    setError(null);
    setInterim('');
    finalTextRef.current = '';
    interimTextRef.current = '';

    // Cleaned mic stream for the analyser. SpeechRecognition opens its own
    // internal capture in parallel — Chrome handles both fine.
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          noiseSuppression: true,
          echoCancellation: true,
          autoGainControl: true,
          channelCount: 1,
          sampleRate: 48000,
        },
      });
    } catch {
      setError('permission'); setStatus('error'); return;
    }
    streamRef.current = stream;

    const AudioCtor = (window.AudioContext
      || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
    const ctx = new AudioCtor();
    audioCtxRef.current = ctx;
    const src = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    src.connect(analyser);

    const data = new Uint8Array(analyser.frequencyBinCount);
    const binSize = Math.floor(data.length / BAR_COUNT);
    const tick = () => {
      analyser.getByteFrequencyData(data);
      const next = new Array(BAR_COUNT);
      for (let b = 0; b < BAR_COUNT; b++) {
        let sum = 0;
        for (let j = 0; j < binSize; j++) sum += data[b * binSize + j];
        next[b] = (sum / binSize) / 255;
      }
      setBars(next);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    const rec = new Ctor();
    rec.lang = lang;
    rec.interimResults = true;
    rec.continuous = true;
    rec.maxAlternatives = 3;
    rec.onstart = () => { console.warn('[voice] started'); };
    rec.onresult = (e: SREvent) => {
      let partial = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        const text = pickBest(r);
        if (r.isFinal) finalTextRef.current += text;
        else partial += text;
      }
      interimTextRef.current = partial;
      setInterim(partial);
      // Live unpolished transcript — pushed to the consumer for word-by-word
      // streaming. Sent via callback (not state) to keep it out of an effect.
      const combined = (finalTextRef.current + (partial ? ' ' + partial : '')).trim();
      if (combined) onTranscriptRef.current?.(combined);
    };
    rec.onerror = (e) => {
      const err = String(e?.error ?? 'error');
      console.warn('[voice] recognition error:', err);
      setError(err);
      // Brave / no-Google-services fingerprint: cache for the session and
      // mark voice non-functional so the UI hides the mic from now on.
      if (err === 'network') {
        setBrokenFlag();
        setFunctional(false);
      }
    };
    rec.onend = () => {
      const trailing = interimTextRef.current.trim();
      const raw = (finalTextRef.current + (trailing ? ' ' + trailing : '')).trim();
      const final = polish(raw);
      console.warn('[voice] ended, transcript length =', final.length);
      if (final) onFinalRef.current(final);
      setInterim('');
      setStatus('idle');
      teardown();
    };
    recRef.current = rec;
    setStatus('listening');
    try { rec.start(); } catch { setError('start_failed'); setStatus('error'); teardown(); }
  }, [lang, status, teardown]);

  useEffect(() => () => teardown(), [teardown]);

  return { status, bars, interim, supported, functional, permission, error, start, stop };
}
