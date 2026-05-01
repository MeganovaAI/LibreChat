import type { TMessage } from 'librechat-data-provider';

const MARKER_RE = /<<<NOVA_PHASE:[^>]+>>>/g;

/**
 * Nova OS fork — strip <<<NOVA_PHASE:key>>> markers from streamed text and
 * forward the most recent phase key to the caller (typically a Recoil
 * setter). Used wherever incoming streaming content might carry the
 * server-emitted phase markers — the OpenAI-compat custom endpoint sends
 * them via two distinct paths in v0.8.5-rc1:
 *   - SSE `message` events with `data.text` → useEventHandlers.messageHandler
 *   - SSE step events `ON_MESSAGE_DELTA` (`contentPart.text`) →
 *     useStepHandler.updateContent
 *
 * Centralized here so both paths stay in sync. Returns the cleaned text;
 * callers replace the original. The reporter callback receives the LAST
 * phase key seen in the chunk (chunks may carry multiple markers when the
 * agent emits them faster than the SSE flush cadence). null/no markers →
 * reporter not called.
 */
export function stripPhaseMarkers(
  text: string,
  reportPhase: (key: string) => void,
): string {
  if (!text || !text.includes('<<<NOVA_PHASE:')) {
    return text;
  }
  const re = /<<<NOVA_PHASE:([^>]+)>>>/g;
  let lastPhase: string | null = null;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    lastPhase = m[1];
  }
  if (lastPhase != null) {
    // eslint-disable-next-line no-console
    console.log('[NOVA_PHASE] strip seen lastPhase=', lastPhase, 'fromTextLen=', text.length);
    reportPhase(lastPhase);
  }
  return text.replace(re, '');
}

/**
 * Strip phase markers from a string, no phase reporting. Used in places
 * where we just want clean text (e.g. when scrubbing persisted messages
 * loaded from MongoDB or finalHandler payloads — we already moved past
 * the streaming-time phase tracking by then).
 */
function scrubText(s: string | undefined): string | undefined {
  if (typeof s !== 'string' || !s.includes('<<<NOVA_PHASE:')) return s;
  return s.replace(MARKER_RE, '');
}

/**
 * Walk a TMessage in place and strip phase markers from every text
 * surface. Handles three storage shapes seen across LibreChat versions:
 *   - .text                              (string, OAI-compat style)
 *   - .content[].text                    (string in newer agent-style content parts)
 *   - .content[].text.value              (object-with-value, used by some
 *                                          assistant/agent endpoints)
 *
 * Idempotent — safe to call on already-clean messages (cheap includes()
 * early-out per text). Used by:
 *   - useEventHandlers.finalHandler (server end-of-stream payload)
 *   - useGetMessagesByConvoId      (history fetch from MongoDB, since the
 *                                   server-side save path doesn't yet strip
 *                                   markers — fixed at the client until the
 *                                   server is patched)
 */
export function scrubPhaseMarkersFromMessage(m: TMessage | undefined): void {
  if (!m) return;
  if (typeof m.text === 'string') {
    const cleaned = scrubText(m.text);
    if (cleaned !== m.text) m.text = cleaned ?? '';
  }
  if (Array.isArray(m.content)) {
    for (const part of m.content) {
      if (!part || typeof part !== 'object') continue;
      const p = part as Record<string, unknown>;
      if (typeof p.text === 'string') {
        p.text = scrubText(p.text as string);
      } else if (p.text && typeof p.text === 'object') {
        const tv = p.text as Record<string, unknown>;
        if (typeof tv.value === 'string') {
          tv.value = scrubText(tv.value as string);
        }
      }
    }
  }
}

/**
 * Convenience: scrub a list of messages in place. Returns the same
 * reference so callers can chain.
 */
export function scrubPhaseMarkersFromMessages(messages: TMessage[]): TMessage[] {
  for (const m of messages) {
    scrubPhaseMarkersFromMessage(m);
  }
  return messages;
}
