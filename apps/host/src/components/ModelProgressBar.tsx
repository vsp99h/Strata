import { tr } from '../lib/i18n';
import { Bar } from './ui';
import { useStore } from '../lib/store';
import { useNative } from '../lib/native';
import { nativeMonitorData } from '../lib/native-monitor';
import { modelProgress, modelProgressDetail } from '../lib/model-progress';
import type { MonitorState } from '../lib/types';

/** What the model is doing, in two words. Every one of these is already in the nine catalogs. */
const PHASE_LABEL: Record<MonitorState['phase'], string> = {
  idle: 'Waiting',
  reading: 'Reading',
  thinking: 'Thinking',
  generating: 'Generating',
  loading: 'Loading model',
  error: 'Stopped',
};

/**
 * The Monitor's "Model progress" as a thin bar under the composer, with the model's state in words, so the person
 * sees what the model is doing without leaving the chat. It stays on screen when the model is idle: a control that
 * appears and disappears draws the eye on every step of an answer.
 *
 * The figures come from the same place the Monitor screen reads them. With a model running under Strata Control the
 * host's own monitor stays idle — Control reports the work through the instance's live metrics — so reading the
 * monitor alone would leave this bar empty in every conversation.
 */
export function ModelProgressBar() {
  const stored = useStore(s => s.monitor);
  const hardware = useStore(s => s.hardware);
  const native = useNative();
  const data = native ? nativeMonitorData(native, hardware) : stored;
  const progress = modelProgress(data);
  const detail = modelProgressDetail(data);
  const phase = progress?.phase ?? 'idle';
  const state = tr(PHASE_LABEL[phase]);
  return <div className="composer-progress">
    <span className="composer-progress__state xs muted">{state}</span>
    <Bar size="sm" label={tr("Model progress")} value={progress?.value ?? 0} indeterminate={progress?.indeterminate ?? false} tone={progress?.tone ?? 'accent'}/>
    {detail ? <span className="composer-progress__detail xs muted">{detail}</span> : null}
  </div>;
}
