import { memo, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useRecoilValue } from 'recoil';
import { useGetStartupConfig } from '~/data-provider';
import store from '~/store';

type LocaleMap = Record<string, string>;
type IndicatorTextConfig = string | LocaleMap | undefined;
type PhaseTable = Record<string, string | LocaleMap> | undefined;

/**
 * Pick a localized string from a (string | locale-map) config value.
 *
 * - String: returned as-is for every locale.
 * - Object map (locale → text): exact-match first, then language-prefix
 *   fallback (`zh-CN` → `zh`), then `default`, then `en`, then the first
 *   key. Returns undefined only when the map is empty.
 */
function pickLocalized(
  raw: string | LocaleMap | undefined,
  language: string,
): string | undefined {
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
 * Resolve the phase label to render right now.
 * Resolution order:
 *   1. If currentPhase is set AND maps to a configured entry in
 *      typingIndicatorPhases (exact key OR `tool:*` wildcard) → that label.
 *   2. If currentPhase is set with `tool:<name>` shape but no specific
 *      entry → auto-fallback to "Running <name>…" (auto-localized via
 *      the `default` / `en` keys of typingIndicatorPhases.tool when set).
 *   3. Otherwise → typingIndicatorText (the static fallback shown before
 *      any phase event arrives).
 */
function resolveLabel(
  currentPhase: string | null,
  phases: PhaseTable,
  text: IndicatorTextConfig,
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
 * Map a phase key to a target fill percentage for the determinate progress
 * bar. Phases advance the bar through reasonable checkpoints — bar fills
 * smoothly toward each target via CSS transition. Caps at 88% so an
 * unexpected long synthesis phase still has visible "almost there"
 * headroom; the bar disappears with EmptyText when first text streams in.
 */
function progressTargetForPhase(phase: string | null): number {
  if (phase === null) return 8;
  if (phase === 'planning') return 22;
  if (phase === 'synthesizing') return 88;
  if (phase.startsWith('tool:')) return 60;
  return 35;
}

/**
 * Streaming cursor placeholder — shown while a response is being generated
 * but before the first content chunk arrives. No bottom margin to match
 * Container's structure and prevent CLS.
 *
 * Nova OS fork:
 * - A1: interface.typingIndicatorText (string OR locale-map) → static
 *   label rendered next to the dot for the entire pre-token wait.
 * - B2: interface.typingIndicatorPhases (key → string | locale-map) +
 *   <<<NOVA_PHASE:key>>> markers stripped upstream → live label that
 *   updates as the agent moves through planning → tool calls → synthesis.
 * - Determinate fill bar: width grows toward a per-phase target via
 *   `progressTargetForPhase`. Smooth via CSS width transition. Tracked
 *   monotonically within a mount lifecycle — never rewinds if a phase
 *   appears out of order.
 */
const EmptyTextPart = memo(() => {
  const { data: startupConfig } = useGetStartupConfig();
  const { i18n } = useTranslation();
  const currentPhase = useRecoilValue(store.currentPhaseAtom);

  // Note: an earlier version reset currentPhase to null in useEffect on
  // mount to avoid a stale phase from the previous message flashing
  // briefly. That backfired — EmptyText unmounts and remounts multiple
  // times during a single conversation (every time content briefly
  // materializes then clears), and each remount fired the reset, wiping
  // the live phase the streaming-time strip had just dispatched. The
  // user saw "Thinking…" most of the time even after the marker stripper
  // correctly set "synthesizing". The reset is now done in
  // useEventHandlers — when a NEW submission starts (one event per
  // conversation, not per render).
  const indicatorText = startupConfig?.interface?.typingIndicatorText as IndicatorTextConfig;
  const phases = startupConfig?.interface?.typingIndicatorPhases as PhaseTable;
  const label = resolveLabel(currentPhase, phases, indicatorText, i18n.language);

  // Elapsed time per phase. Reset whenever currentPhase changes; tick once
  // per second to update the rendered "(Ns)" suffix. Hidden until ≥1s so
  // very-fast phases don't flash "(0s)" briefly. The phase-key string is
  // the trigger — both null→"planning" and "planning"→"synthesizing"
  // restart the timer.
  const phaseStartedAt = useRef<number>(Date.now());
  const lastPhaseKey = useRef<string | null>(currentPhase);
  if (lastPhaseKey.current !== currentPhase) {
    phaseStartedAt.current = Date.now();
    lastPhaseKey.current = currentPhase;
  }
  const [elapsedSec, setElapsedSec] = useState(0);
  useEffect(() => {
    const tick = () => {
      setElapsedSec(Math.floor((Date.now() - phaseStartedAt.current) / 1000));
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [currentPhase]);

  // Determinate progress with continuous creep. Two-layer model:
  //
  //   1. ceilingRef — monotonic max of the per-phase target. Each phase
  //      advance raises the ceiling. Never decreases (defends against
  //      out-of-order server phases).
  //
  //   2. shownPct — the rendered fill, ticked toward ceilingRef every
  //      ~200ms. Asymptotic with a floor: closes 6% of the remaining gap
  //      per tick, but never less than 0.5% so the very last bit still
  //      visibly creeps. This is what addresses the "bar looks frozen
  //      while elapsed time keeps rising" problem — even within a single
  //      phase that takes 13s, the bar keeps advancing toward the phase
  //      ceiling, so the user sees continuous progress.
  //
  //   Phase change → ceiling jumps to new target → next tick advances
  //   shownPct visibly toward the new ceiling, so transitions read as
  //   acceleration rather than discrete jumps.
  const phaseTarget = progressTargetForPhase(currentPhase);
  const ceilingRef = useRef(phaseTarget);
  if (phaseTarget > ceilingRef.current) {
    ceilingRef.current = phaseTarget;
  }
  const [shownPct, setShownPct] = useState(progressTargetForPhase(null));
  useEffect(() => {
    const id = window.setInterval(() => {
      setShownPct((prev) => {
        const ceiling = ceilingRef.current;
        if (ceiling - prev < 0.5) return prev;
        const step = Math.max(0.5, (ceiling - prev) * 0.06);
        return Math.min(ceiling, prev + step);
      });
    }, 200);
    return () => window.clearInterval(id);
  }, []);

  // Original LibreChat dot: rendered via `.submitting .result-thinking:empty:last-child:after`
  // which requires result-thinking to be the LAST CHILD of <p>. Adding a sibling span
  // (the label) breaks the :last-child match → dot stops rendering and the label can also
  // get clipped by the absolutely-positioned wrapper. Keep two separate <p>s — one for the
  // dot (always rendered, structurally untouched), one for the label (only when set, sits
  // inline next to the dot via flex). This lets the dot animation still work via the CSS
  // hack while the label shows up reliably regardless of phase state.
  return (
    <div className="text-message flex min-h-[20px] flex-col items-start gap-3 overflow-visible">
      <div className="markdown prose dark:prose-invert light w-full break-words dark:text-gray-100">
        <div className="flex flex-col items-start gap-1">
          <div className="flex items-center">
            {/* Wrap the dot in a fixed-width box so its absolutely-positioned
                `:after` pseudo-element (top: -11px, ~12px tall) doesn't
                overlap the label that follows. */}
            <p className="submitting relative inline-block w-[18px] flex-shrink-0">
              <span className="result-thinking" />
            </p>
            {label && (
              <span className="ml-2 text-sm text-text-secondary">
                {label}
                {elapsedSec >= 1 && (
                  <span className="ml-1 text-text-tertiary">({elapsedSec}s)</span>
                )}
              </span>
            )}
          </div>
          {/* Determinate progress bar — width grows in jumps as the agent
              moves through phases (planning → tool → synthesizing). For
              non-technical users who skim past textual indicators, the
              filling bar reads as "actively making progress" without
              promising a specific percentage. Disappears when EmptyText
              unmounts (first content chunk arrives). */}
          <div
            className="ml-[26px] h-[6px] w-48 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700"
            role="progressbar"
            aria-label={label ?? 'Working'}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={shownPct}
          >
            <div
              className="h-full rounded-full bg-blue-500 transition-[width] duration-200 ease-linear"
              style={{ width: `${shownPct}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
});

export default EmptyTextPart;
