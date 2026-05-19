import React from 'react';
import type { NovaPersonasSessionMetadata } from 'librechat-data-provider';

const SHOW_FOR = new Set(['capture', 'training']);

interface Props {
  metadata?: NovaPersonasSessionMetadata;
  stealthMode?: boolean;
  onLearnMore?: () => void;
  onDismiss?: () => void;
}

/**
 * Sticky banner above the chat conversation. Renders only when the
 * session is a nova-personas synthetic-training session AND stealth
 * mode is off.
 *
 * Visual: yellow accent (#FDDC69) per docs/ui-requirements.md § 2.
 */
export function SyntheticBanner({
  metadata = {},
  stealthMode = false,
  onLearnMore,
  onDismiss,
}: Props): JSX.Element | null {
  if (stealthMode) return null;
  if (!SHOW_FOR.has(metadata.session_purpose ?? '')) return null;

  return (
    <div
      role="status"
      className="sticky top-0 z-50 flex items-center gap-3 bg-yellow-200 px-4 py-3 text-sm text-gray-900 border-b border-gray-300"
      data-testid="nova-personas-synthetic-banner"
    >
      <span aria-hidden="true" className="text-lg">&#x24D8;</span>
      <span className="flex-1">
        Synthetic training session — your responses help improve this AI.
        Your flags and ratings shape the persona's future variants.
      </span>
      {onLearnMore && (
        <button
          type="button"
          onClick={onLearnMore}
          className="rounded border border-gray-900 px-2 py-1 text-xs hover:bg-yellow-300"
        >
          Learn more
        </button>
      )}
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="rounded border border-gray-900 px-2 py-1 text-xs hover:bg-yellow-300"
        >
          Dismiss for this session
        </button>
      )}
    </div>
  );
}
