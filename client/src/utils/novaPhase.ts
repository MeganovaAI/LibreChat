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
    reportPhase(lastPhase);
  }
  return text.replace(re, '');
}
