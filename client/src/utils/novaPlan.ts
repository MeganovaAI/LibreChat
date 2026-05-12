import type { TMessage } from 'librechat-data-provider';
import type { PlanStep } from '~/store/progress';

export type PlanStepWire = {
  id: string;
  description: string;
  capability: string;
};

export type PlanStepStatus = 'started' | 'done' | 'error';

/**
 * Nova OS fork — pure reducer for a single `<<<NOVA_STEP:id:status>>>`
 * transition. Maps the wire status (`started|done|error`) to the atom's
 * status enum (`active|done|error`) and stamps client-side timing on the
 * matching step. Centralized here so both SSE entry points
 * (useEventHandlers.messageHandler and useStepHandler.updateContent) stay
 * in lockstep — they used to copy-paste this transition logic.
 */
export function applyPlanStepTransition(
  prev: PlanStep[],
  taskID: string,
  status: PlanStepStatus,
): PlanStep[] {
  const now = Date.now();
  return prev.map((s) => {
    if (s.id !== taskID) {
      return s;
    }
    if (status === 'started') {
      return { ...s, status: 'active', startedAt: s.startedAt ?? now };
    }
    if (status === 'done') {
      return { ...s, status: 'done', startedAt: s.startedAt ?? now, completedAt: now };
    }
    return { ...s, status: 'error', startedAt: s.startedAt ?? now, completedAt: now };
  });
}

const PLAN_RE = /<<<NOVA_PLAN:([A-Za-z0-9+/=]+)>>>/g;
const STEP_RE = /<<<NOVA_STEP:([^:>]+):(started|done|error)>>>/g;
const COMBINED_RE = /<<<NOVA_(?:PLAN|STEP):[^>]+>>>/g;

/**
 * Decode a base64-encoded UTF-8 JSON payload into a string preserving
 * non-ASCII characters. The naive `atob(b64)` path returns a binary
 * string where each char is a byte 0–255 — when the server emits
 * Chinese plan-step labels (UTF-8 multi-byte sequences) and we feed
 * that binary string directly to JSON.parse, each byte becomes its
 * own Latin-1 codepoint and the resulting object renders as
 * mojibake (e.g. "搜索知识库" → "æœç´¢ç¥è¯åº"). Observed on the
 * bosong 2026-05-12 Progress sidebar after the server-side planner
 * started honouring the request-language directive.
 *
 * We convert each binary byte to its `%XX` percent-escape sequence
 * then run `decodeURIComponent`. That handles multi-byte UTF-8 in
 * every browser since at least 2010 without depending on
 * `TextDecoder` (which is absent from Jest's default jsdom
 * environment — production browsers have it, but the test harness
 * doesn't and we want this path covered by tests).
 */
function decodeBase64Utf8(b64: string): string {
  const bin = atob(b64);
  let escaped = '';
  for (let i = 0; i < bin.length; i++) {
    const hex = bin.charCodeAt(i).toString(16).padStart(2, '0');
    escaped += '%' + hex;
  }
  return decodeURIComponent(escaped);
}

/**
 * Nova OS fork — strip <<<NOVA_PLAN:base64-json>>> markers from streamed
 * text and forward the parsed step list to the caller (typically a Recoil
 * setter for `planStepsAtom`). Sibling of `stripPhaseMarkers` in
 * `novaPhase.ts`. Same call sites — both SSE paths in v0.8.5-rc1:
 *   - SSE `message` events with `data.text` → useEventHandlers.messageHandler
 *   - SSE step events `ON_MESSAGE_DELTA` (`contentPart.text`) →
 *     useStepHandler.updateContent
 *
 * Reporter is invoked with the LAST plan seen in the chunk (in practice
 * there's only one per turn, emitted right after the planner finalizes).
 * Malformed base64 / non-JSON payloads are silently dropped — progress
 * UX is best-effort, never load-bearing.
 */
export function stripPlanMarkers(
  text: string,
  reportPlan: (steps: PlanStepWire[]) => void,
): string {
  if (!text || !text.includes('<<<NOVA_PLAN:')) {
    return text;
  }
  const re = /<<<NOVA_PLAN:([A-Za-z0-9+/=]+)>>>/g;
  let lastPlan: PlanStepWire[] | null = null;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    try {
      const decoded = decodeBase64Utf8(m[1]);
      const parsed: unknown = JSON.parse(decoded);
      if (Array.isArray(parsed)) {
        lastPlan = parsed as PlanStepWire[];
      }
    } catch {
      // Malformed marker — drop. Plan UX is best-effort.
    }
  }
  if (lastPlan != null) {
    reportPlan(lastPlan);
  }
  return text.replace(PLAN_RE, '');
}

/**
 * Strip <<<NOVA_STEP:id:status>>> markers and report EVERY transition
 * to the caller. Unlike phase markers (where only the last matters),
 * step transitions are individually meaningful — `started` then `done`
 * for the same task ID drive distinct UI state changes.
 */
export function stripStepMarkers(
  text: string,
  reportStep: (taskID: string, status: PlanStepStatus) => void,
): string {
  if (!text || !text.includes('<<<NOVA_STEP:')) {
    return text;
  }
  const re = /<<<NOVA_STEP:([^:>]+):(started|done|error)>>>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    reportStep(m[1], m[2] as PlanStepStatus);
  }
  return text.replace(STEP_RE, '');
}

function scrubText(s: string | undefined): string | undefined {
  if (typeof s !== 'string') return s;
  if (!s.includes('<<<NOVA_PLAN:') && !s.includes('<<<NOVA_STEP:')) return s;
  return s.replace(COMBINED_RE, '');
}

/**
 * Walk a TMessage in place and strip plan/step markers from every text
 * surface. Same three storage shapes as `scrubPhaseMarkersFromMessage`.
 * Idempotent — safe on already-clean messages (cheap includes() check).
 */
export function scrubPlanMarkersFromMessage(m: TMessage | undefined): void {
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

export function scrubPlanMarkersFromMessages(messages: TMessage[]): TMessage[] {
  for (const m of messages) {
    scrubPlanMarkersFromMessage(m);
  }
  return messages;
}
