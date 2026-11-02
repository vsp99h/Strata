import { tr } from './i18n';
import { sendOversized, startNewChat, stopStreaming, summarizeAndContinue } from './store';

/**
 * What the error card of a chat offers when the model's window is the problem. A conversation that no longer fits can be summarised and
 * carried on, or left for a new chat; a single message that is too large can go as a file the assistant reads in parts, or as a shortened
 * preview. "Try the message again" would only fail the same way, so the card never says it for these.
 */
export function contextRecovery(code: string | undefined): {
  next: string;
  action?: string;
  onRetry?: () => void;
  secondary?: { label: string; onClick: () => void };
} {
  if (code === 'CONTEXT_MESSAGE_TOO_LARGE') {
    return {
      next: tr('Attach it as a file for the assistant to read in parts, or send a shortened preview.'),
      action: 'Attach as a file',
      onRetry: () => void sendOversized('file'),
      secondary: { label: 'Send a shortened preview', onClick: () => void sendOversized('preview') },
    };
  }
  if (code === 'CONTEXT_WINDOW_EXCEEDED') {
    return {
      next: tr('Summarize it now and continue, or start a new chat.'),
      action: 'Summarize and continue',
      onRetry: () => void summarizeAndContinue(),
      secondary: { label: 'Start a new chat', onClick: () => startNewChat() },
    };
  }
  if (code === 'turn-active') {
    // The page was reloaded while a turn was running. The browser forgot the stream; the host did not
    // forget the turn, and it will not start a second one on the same chat. Sending again fails the same
    // way forever, and the only way out used to be a new chat - so the card offers the thing that frees it.
    return {
      next: tr('The answer from before the page was reloaded is still being written. Stop it, or wait for it to finish.'),
      action: 'Stop',
      onRetry: () => stopStreaming(),
    };
  }
  return { next: tr('Try sending the message again.') };
}
