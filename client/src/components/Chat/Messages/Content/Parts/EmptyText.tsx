import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { useGetStartupConfig } from '~/data-provider';

/**
 * Pick the localized typing-indicator text from the configured value.
 *
 * - String: returned as-is for every locale.
 * - Object map (locale → text): exact-match first, then language-prefix
 *   fallback (`zh-CN` → `zh`), then `default`, then `en`, then the first
 *   key. Returns undefined only when the map is empty.
 *
 * Kept in this file so the rendering component remains a pure function
 * of (config, current language) — no extra hooks or providers needed.
 */
function pickIndicatorText(
  raw: string | Record<string, string> | undefined,
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
 * Streaming cursor placeholder — shown while a response is being generated
 * but before the first content chunk arrives. No bottom margin to match
 * Container's structure and prevent CLS.
 *
 * Nova OS fork: when interface.typingIndicatorText is set in librechat.yaml,
 * the localized text is rendered to the right of the dot so users on slow
 * agentic backends (brain plan + tool calls before synthesis) see something
 * other than a stationary dot during the silent pre-token phase.
 */
const EmptyTextPart = memo(() => {
  const { data: startupConfig } = useGetStartupConfig();
  const { i18n } = useTranslation();
  const indicatorText = pickIndicatorText(
    startupConfig?.interface?.typingIndicatorText as string | Record<string, string> | undefined,
    i18n.language,
  );
  return (
    <div className="text-message flex min-h-[20px] flex-col items-start gap-3 overflow-visible">
      <div className="markdown prose dark:prose-invert light w-full break-words dark:text-gray-100">
        <div className="absolute">
          <p className="submitting relative">
            <span className="result-thinking" />
            {indicatorText && (
              <span className="ml-2 text-text-secondary">{indicatorText}</span>
            )}
          </p>
        </div>
      </div>
    </div>
  );
});

export default EmptyTextPart;
