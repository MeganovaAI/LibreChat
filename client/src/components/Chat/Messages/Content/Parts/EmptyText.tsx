import { memo } from 'react';
import { useGetStartupConfig } from '~/data-provider';

/**
 * Streaming cursor placeholder — shown while a response is being generated
 * but before the first content chunk arrives. No bottom margin to match
 * Container's structure and prevent CLS.
 *
 * Nova OS fork: when interface.typingIndicatorText is set in librechat.yaml,
 * the text is rendered to the right of the dot so users on slow agentic
 * backends (brain plan + tool calls before synthesis) see something other
 * than a stationary dot during the silent pre-token phase.
 */
const EmptyTextPart = memo(() => {
  const { data: startupConfig } = useGetStartupConfig();
  const indicatorText = startupConfig?.interface?.typingIndicatorText;
  return (
    <div className="text-message flex min-h-[20px] flex-col items-start gap-3 overflow-visible">
      <div className="markdown prose dark:prose-invert light w-full break-words dark:text-gray-100">
        <div className="absolute">
          <p className="submitting relative">
            <span className="result-thinking" />
            {typeof indicatorText === 'string' && indicatorText.length > 0 && (
              <span className="ml-2 text-text-secondary">{indicatorText}</span>
            )}
          </p>
        </div>
      </div>
    </div>
  );
});

export default EmptyTextPart;
