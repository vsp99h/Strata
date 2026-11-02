import { hasReading } from './monitor-hardware';
import { tokens, tps } from './format';
import type { MonitorState } from './types';

export interface ModelProgress {
  /** 0..100, the Monitor's own figure. */
  value: number;
  /** The work is known to be happening but its size is not, so the bar sweeps instead of filling. */
  indeterminate: boolean;
  tone: 'accent' | 'info';
  phase: MonitorState['phase'];
}

const percent = (used: number | null | undefined, total: number | null | undefined) =>
  hasReading(used) && hasReading(total) && (total as number) > 0 ? Math.max(0, Math.min(100, (used as number) / (total as number) * 100)) : null;

/**
 * How far the model is with the request it is working on: the share of the prompt it has read, then the share of
 * the answer it has written. One place, so the Monitor's top bar and the thin bar under the composer never disagree.
 * Returns null when there is no telemetry yet.
 */
export function modelProgress(data: MonitorState | null | undefined): ModelProgress | null {
  if (!data || !data.phase) return null;
  if (data.phase === 'loading') return { value: 0, indeterminate: true, tone: 'info', phase: data.phase };
  const writing = data.phase === 'generating' || data.phase === 'thinking';
  const read = data.phase === 'reading' ? data.prompt?.pct ?? null : null;
  const measured = data.phase === 'reading' ? (hasReading(read) ? Math.max(0, Math.min(100, read as number)) : null) : writing ? percent(data.generation?.done, data.generation?.total) : null;
  return {
    value: measured ?? 0,
    indeterminate: writing && !hasReading(measured),
    tone: data.phase === 'reading' ? 'info' : 'accent',
    phase: data.phase,
  };
}

const line = (parts: (string | null | undefined)[]) => parts.filter(Boolean).join(' · ') || null;

/**
 * The same progress in figures: how fast the model is running right now, then how far it has got.
 * Reading reports the prompt it has taken in, writing reports the answer it has produced.
 *
 * Worded like the Monitor's status line on purpose - two bars that spell the same number differently are
 * worse than one. Returns null when there is nothing honest to show: an idle model, or a phase whose
 * counts have not arrived yet.
 */
export function modelProgressDetail(data: MonitorState | null | undefined): string | null {
  if (!data) return null;
  const speed = (n: number | null | undefined) => (hasReading(n) ? `${tps(n)} tok/s` : null);
  if (data.phase === 'reading') {
    const total = data.prompt?.total;
    // A total of zero means the engine has not said how big the prompt is, and hasReading(0) is true, so
    // without this the line would confidently claim "0 / 0 (0%)".
    if (!hasReading(total) || (total as number) <= 0) return null;
    return line([speed(data.promptTps), `${tokens(data.prompt.done)} / ${tokens(total)} (${Math.round(Math.max(0, Math.min(100, data.prompt.pct)))}%)`]);
  }
  if (data.phase === 'generating' || data.phase === 'thinking') {
    const done = data.generation?.done;
    if (!hasReading(done)) return null;
    const total = data.generation?.total;
    // The answer's size is often unknown until it ends, so the share is shown only when there is a real total.
    const progress = hasReading(total) && (total as number) > 0
      ? `${tokens(done)} / ${tokens(total)} (${Math.round(Math.max(0, Math.min(100, (done as number) / (total as number) * 100)))}%)`
      : `${tokens(done)} tokens`;
    return line([speed(data.outputTps), progress]);
  }
  return null;
}
