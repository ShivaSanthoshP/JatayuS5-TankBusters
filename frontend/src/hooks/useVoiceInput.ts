import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Push-to-talk speech-to-text via the browser's Web Speech API, with a live
 * audio-level meter driven by a separate WebAudio analyser. The hook delivers
 * the final transcript exactly once (when the user stops) via `onFinal`.
 * Locale defaults to `en-IN` so the recognizer biases toward Indian English.
 *
 * The Web Speech API has uneven cross-browser support — `supported` is `false`
 * when the constructor is missing (notably Firefox) so the caller can disable
 * the mic UI gracefully.
 */

const BAR_COUNT = 5;

type Status = 'idle' | 'listening' | 'error';

interface UseVoiceInputOpts {
  lang?: string;
  onFinal: (text: string) => void;
}

interface UseVoiceInput {
  status: Status;
  bars: number[];      // length BAR_COUNT, each 0–1, fresh on every audio frame
  interim: string;     // best-effort partial transcript for live display
  supported: boolean;
  error: string | null;
  start: () => Promise<void>;
  stop: () => void;
}

// ── Minimal types for the vendor Web Speech API (not in lib.dom.d.ts) ──
type SRAlternative = { transcript: string; confidence: number };
type SRResult = ArrayLike<SRAlternative> & { isFinal: boolean };
type SREvent = { resultIndex: number; results: ArrayLike<SRResult> };
interface SR {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
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

/** Pick the highest-confidence alternative; fall back to the first one when
 *  confidence is missing (Chrome reports 0 for interim results). */
function pickBest(r: SRResult): string {
  let best = r[0];
  for (let k = 1; k < r.length; k++) {
    const c = r[k].confidence ?? 0;
    if (c > (best.confidence ?? 0)) best = r[k];
  }
  return best.transcript;
}

// Domain post-processing — fixes the SRE/AWS terms the Web Speech recognizer
// most reliably mishears, especially on Indian English. Kept small and
// specific so unrelated words aren't accidentally rewritten.
const TECH_FIXES: Array<[RegExp, string]> = [
  [/\b(?:cube|kube)[ -]?(?:control|cuddle|c\s*t\s*l)\b/gi, 'kubectl'],
  [/\bkuber[ -]?net(?:is|tis|ties|es)?\b/gi, 'kubernetes'],
  [/\b(?:ec|easy)[ -]?two\b/gi, 'EC2'],
  [/\bs[ -]?(?:three|free)\b/gi, 'S3'],
  [/\b(?:i[ -]?a[ -]?m|i\.a\.m\.)\b/gi, 'IAM'],
  [/\bcloud[ -]?watch\b/gi, 'CloudWatch'],
  [/\bcloud[ -]?formation\b/gi, 'CloudFormation'],
  [/\bcloud[ -]?front\b/gi, 'CloudFront'],
  [/\bcloud[ -]?trail\b/gi, 'CloudTrail'],
  [/\bdata[ -]?dog\b/gi, 'Datadog'],
  [/\bpager[ -]?duty\b/gi, 'PagerDuty'],
  [/\bgraph[ -]?fana\b/gi, 'Grafana'],
  [/\bgrafana\b/g, 'Grafana'],
  [/\bprometheus\b/g, 'Prometheus'],
  [/\bkafka\b/g, 'Kafka'],
  [/\bargus\b/gi, 'Argus'],
];

function polish(text: string): string {
  let out = text;
  for (const [re, sub] of TECH_FIXES) out = out.replace(re, sub);
  // Collapse double spaces and tidy whitespace before punctuation.
  return out.replace(/\s+/g, ' ').replace(/\s+([.,!?;:])/g, '$1').trim();
}

export function useVoiceInput(opts: UseVoiceInputOpts): UseVoiceInput {
  const { lang = 'en-IN', onFinal } = opts;
  const [status, setStatus] = useState<Status>('idle');
  const [bars, setBars] = useState<number[]>(() => new Array(BAR_COUNT).fill(0));
  const [interim, setInterim] = useState('');
  const [error, setError] = useState<string | null>(null);

  const supported = !!getSRCtor();

  const recRef = useRef<SR | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef(0);
  const finalTextRef = useRef('');
  const interimTextRef = useRef('');
  const onFinalRef = useRef(onFinal);
  useEffect(() => { onFinalRef.current = onFinal; }, [onFinal]);

  const teardown = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    const rec = recRef.current;
    if (rec) {
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

    // Mic stream for the visual analyser. SpeechRecognition opens its own
    // internal capture in parallel — Chrome handles both fine.
    // Constraints clean the input audio before STT sees it: noise suppression
    // kills HVAC hum, echoCancellation removes speaker bleed, autoGainControl
    // levels soft speech. Mono + high sample rate match what the recognizer
    // wants. These materially lift accuracy on noisy rooms and laptop mics.
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
    // Ask the engine for its top-3 hypotheses per chunk — `pickBest` then
    // chooses the highest-confidence one, which beats blindly taking #1.
    rec.maxAlternatives = 3;
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
    };
    rec.onerror = (e) => {
      const err = String(e?.error ?? 'error');
      // Log so it's visible in devtools when debugging mic/permission issues.
      console.warn('[voice] recognition error:', err);
      setError(err);
    };
    rec.onend = () => {
      const trailing = interimTextRef.current.trim();
      const raw = (finalTextRef.current + (trailing ? ' ' + trailing : '')).trim();
      const final = polish(raw);
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

  return { status, bars, interim, supported, error, start, stop };
}
