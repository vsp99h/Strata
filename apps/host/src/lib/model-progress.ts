import { hasReading } from './monitor-hardware';
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
