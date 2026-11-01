import { tr } from '../lib/i18n';
import { Btn, Icon } from './ui';
import { sendMessage } from '../lib/store';
import { clearDeferred, useDeferred, type DeferredQuestion } from '../lib/deferred';

/** What goes to the assistant: the earlier question, named, with the ask to pick it up rather than restart. */
const resumeInstruction = (q: DeferredQuestion) => `Let's go back to the question you were working on before this interruption. Pick it up where it stood, and finish it now:\n\n${q.text}`;

/**
 * Questions left open when a comment joined a running turn. One click sends the earlier question back to the
 * assistant with the ask to continue it; the x forgets it. Nothing is sent without the person pressing the button.
 */
export function DeferredQuestions({ chatId }: { chatId: string | null | undefined }) {
  const items = useDeferred(chatId);
  if (!chatId || !items.length) return null;
  return <div className="deferred" role="region" aria-label={tr("Interrupted question")}>
    {items.map(q => <div className="deferred__row" key={q.id}>
      <Icon name="clock" size={13}/>
      <span className="deferred__text xs muted" title={q.text}>{q.text}</span>
      <Btn size="sm" variant="ghost" onClick={() => { clearDeferred(chatId, q.id); void sendMessage(resumeInstruction(q), { shown: tr("Returning to the interrupted question") }); }}>{tr("Return to it")}</Btn>
      <button type="button" className="deferred__x" title={tr("Dismiss")} aria-label={tr("Dismiss")} onClick={() => clearDeferred(chatId, q.id)}>×</button>
    </div>)}
  </div>;
}
