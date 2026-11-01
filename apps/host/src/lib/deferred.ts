import { useSyncExternalStore } from 'react';

/**
 * A question the assistant was working on when a comment joined the turn.
 *
 * A comment typed mid-turn is delivered into the running turn, and the assistant then answers the newest
 * instruction - which is what the person asked for, but it leaves the earlier question open with nothing on
 * screen to mark it. These entries are that mark: the page remembers what was in flight and offers one click
 * back to it. They live only for the page's life; the conversation itself is the record.
 */
export interface DeferredQuestion { id: string; text: string; at: string }

const lists = new Map<string, DeferredQuestion[]>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(fn => fn());
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
const NONE: DeferredQuestion[] = [];
/** Three is enough to notice and small enough never to push the composer off screen. */
const MAX = 3;
let seq = 0;

const sameThread = (a: string, b: string) => a === b || a.startsWith(b.slice(0, 60)) || b.startsWith(a.slice(0, 60));

/** Record the question a turn was working on. Repeats of the same thread are ignored. */
export function noteDeferred(chatId: string, text: unknown) {
  const clean = String(text ?? '').trim().slice(0, 400);
  if (!clean) return;
  const list = lists.get(chatId) ?? [];
  if (list.some(q => sameThread(q.text, clean))) return;
  lists.set(chatId, [...list, { id: `d${++seq}`, text: clean, at: new Date().toISOString() }].slice(-MAX));
  emit();
}

export const deferredOf = (chatId: string | null | undefined): DeferredQuestion[] => (chatId ? lists.get(chatId) ?? NONE : NONE);

/** Take one away (clicked or dismissed), or the whole list when the chat is closed. */
export function clearDeferred(chatId: string, id?: string) {
  if (!id) { if (lists.delete(chatId)) emit(); return; }
  const list = lists.get(chatId) ?? [];
  const kept = list.filter(q => q.id !== id);
  if (kept.length === list.length) return;
  if (kept.length) lists.set(chatId, kept); else lists.delete(chatId);
  emit();
}

export function useDeferred(chatId: string | null | undefined): DeferredQuestion[] {
  return useSyncExternalStore(subscribe, () => deferredOf(chatId), () => NONE);
}
