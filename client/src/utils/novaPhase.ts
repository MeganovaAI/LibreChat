import { BookOpen, Globe, ListTodo, Sparkles, Wrench } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { TMessage } from 'librechat-data-provider';

const MARKER_RE = /<<<NOVA_PHASE:[^>]+>>>/g;

type LocaleMap = Record<string, string>;
type PhaseLabelConfig = string | LocaleMap | undefined;
export type PhaseTable = Record<string, string | LocaleMap> | undefined;

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

/**
 * Variant of `stripPhaseMarkers` that invokes `reportPhase` for EVERY
 * marker found in the input, in order. Used by the activity-timeline
 * accumulator (`phaseEventsAtom`) which needs each phase as a distinct
 * event, not just the latest one. The single-latest variant above stays
 * for the typing-indicator subtitle (`currentPhaseAtom`) which only
 * cares about the most recent phase.
 *
 * Callers are responsible for not double-feeding the same buffer slice:
 * - `useStepHandler.updateContent` is naturally delta-based (priorText is
 *   already-stripped, so re-running over the running concat won't see
 *   prior markers again).
 * - `useEventHandlers.messageHandler` receives the full message-so-far on
 *   every chunk; it must slice by lastSeenLength before invoking this.
 */
export function stripPhaseMarkersAll(
  text: string,
  reportPhase: (key: string) => void,
): string {
  if (!text || !text.includes('<<<NOVA_PHASE:')) {
    return text;
  }
  const re = /<<<NOVA_PHASE:([^>]+)>>>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    reportPhase(m[1]);
  }
  return text.replace(re, '');
}

/**
 * Pick a localized string from a (string | locale-map) config value.
 * Resolution: exact-match language → language prefix (`zh-CN` → `zh`) →
 * `default` → `en` → first key. Returns undefined only when the map is
 * empty. Extracted from `EmptyText.tsx` so ProgressPanel can reuse it.
 */
function pickLocalized(raw: PhaseLabelConfig, language: string): string | undefined {
  if (typeof raw === 'string') {
    return raw.length > 0 ? raw : undefined;
  }
  if (!raw || typeof raw !== 'object') {
    return undefined;
  }
  if (raw[language]) {
    return raw[language];
  }
  const prefix = language.split('-')[0];
  if (prefix && raw[prefix]) {
    return raw[prefix];
  }
  if (raw.default) {
    return raw.default;
  }
  if (raw.en) {
    return raw.en;
  }
  const firstKey = Object.keys(raw)[0];
  return firstKey ? raw[firstKey] : undefined;
}

/**
 * Resolve the label to render for a given phase key. Mirrors the
 * resolution order documented at `EmptyText.tsx`:
 *   1. Exact match in `phases` table.
 *   2. `tool:<name>` falls back to `phases['tool:*']` or `phases.tool`
 *      with `{tool}` substitution.
 *   3. Fallback to `text` (the static typing-indicator string).
 */
export function resolveLabel(
  currentPhase: string | null,
  phases: PhaseTable,
  text: PhaseLabelConfig,
  language: string,
): string | undefined {
  if (currentPhase && phases) {
    if (phases[currentPhase]) {
      return pickLocalized(phases[currentPhase], language);
    }
    if (currentPhase.startsWith('tool:')) {
      const toolName = currentPhase.slice('tool:'.length);
      const fallback = phases['tool:*'] ?? phases.tool;
      if (fallback) {
        const template = pickLocalized(fallback, language);
        return template ? template.replace('{tool}', toolName) : undefined;
      }
    }
  }
  return pickLocalized(text, language);
}

/**
 * Map a phase key to a representative lucide icon for ProgressPanel
 * timeline rows. Recognized tool subkeys cover the common nova-os
 * skills; everything else falls through to a generic wrench so a new
 * tool name still renders.
 */
export function phaseIcon(key: string): LucideIcon {
  if (key === 'planning') return ListTodo;
  if (key === 'synthesizing') return Sparkles;
  if (key.startsWith('tool:')) {
    const tool = key.slice('tool:'.length);
    if (tool.includes('knowledge') || tool.includes('memory')) return BookOpen;
    if (tool.includes('web') || tool.includes('tavily') || tool.includes('search')) return Globe;
    return Wrench;
  }
  return Wrench;
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
