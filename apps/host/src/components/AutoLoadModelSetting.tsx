import { useEffect, useState } from 'react';
import { tr } from '../lib/i18n';
import { Select } from './ui';
import { useNative } from '../lib/native';
import { api } from '../lib/client';
import { useStore } from '../lib/store';

/**
 * Which model Strata loads when it opens (Settings → General). The host keeps the choice and starts the model the
 * same way the Models screen does, so the settings saved for that model are the settings it starts with.
 * "Don't load" is the default: nothing starts by itself, exactly as before this setting existed.
 */
export function AutoLoadModelSetting() {
  const native = useNative();
  const saved = useStore(s => s.setup?.autoLoad ?? null);
  const [value, setValue] = useState(saved ?? 'none');
  useEffect(() => { setValue(saved ?? 'none'); }, [saved]);
  // Only models whose files are here can be started; a half-downloaded model would fail at every start.
  const models = (native?.installed?.models ?? []).filter(m => m.model && !m.missing_files?.length);
  const options = [{ value: 'none', label: tr("Don't load") }, ...models.map(m => ({ value: m.model, label: m.model_name || m.model }))];
  const chosen = options.some(o => o.value === value) ? value : 'none';
  function pick(next: string) {
    setValue(next);
    void api.post('/api/settings/autoload', { model: next }).catch(() => setValue(saved ?? 'none'));
  }
  return <Select ariaLabel={tr("Model to load when Strata starts")} value={chosen} options={options} onChange={pick}/>;
}
