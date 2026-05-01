import { atom } from 'recoil';

/**
 * Nova OS fork — currentPhaseAtom holds the most recent phase key emitted
 * by the upstream agent (planning / tool:web_search / synthesizing / …).
 *
 * Set by the marker-stripper in useEventHandlers.messageHandler whenever a
 * <<<NOVA_PHASE:key>>> marker is seen in the streaming content. Read by
 * EmptyText.tsx to render a localized indicator. Reset to null when a
 * conversation completes / cancels / errors so the next message starts
 * with the static fallback.
 *
 * Single global atom (not per-message) — only one streaming response can
 * be in-flight per user at a time.
 */
const currentPhaseAtom = atom<string | null>({
  key: 'currentPhase',
  default: null,
});

const phase = { currentPhaseAtom };
export default phase;
