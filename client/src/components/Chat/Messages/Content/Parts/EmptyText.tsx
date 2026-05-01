import { memo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useRecoilValue, useSetRecoilState } from 'recoil';
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
 */
const EmptyTextPart = memo(() => {
  const { data: startupConfig } = useGetStartupConfig();
  const { i18n } = useTranslation();
  const currentPhase = useRecoilValue(store.currentPhaseAtom);
  const setCurrentPhase = useSetRecoilState(store.currentPhaseAtom);

  // Reset on mount so a phase carried over from the previous message
  // doesn't briefly flash here. The first NOVA_PHASE marker of the new
  // message will set it again within milliseconds.
  useEffect(() => {
    setCurrentPhase(null);
  }, [setCurrentPhase]);

  const indicatorText = startupConfig?.interface?.typingIndicatorText as IndicatorTextConfig;
  const phases = startupConfig?.interface?.typingIndicatorPhases as PhaseTable;
  const label = resolveLabel(currentPhase, phases, indicatorText, i18n.language);

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
        <div className="flex items-center gap-3">
          <p className="submitting relative">
            <span className="result-thinking" />
          </p>
          {label && (
            <span className="text-sm text-text-secondary">{label}</span>
          )}
        </div>
      </div>
    </div>
  );
});

export default EmptyTextPart;
