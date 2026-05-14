import type { TConversation } from 'librechat-data-provider';
import type { SetterOrUpdater } from 'recoil';
import { useGetStartupConfig } from '~/data-provider';
import ModelSelector from '~/components/Chat/Menus/Endpoints/ModelSelector';

/**
 * AddedConvo renders the chip above the textarea that represents the second
 * (side-by-side / multi-convo) conversation. Click the embedded model
 * selector to pick a different agent / model for the added pane — this
 * unlocks A/B testing across two endpoints from a single prompt.
 *
 * The model picker drives `conversationByIndex(1)` directly via the
 * `index={1}` prop on `<ModelSelector>` (added 2026-05-14). The data
 * layer (useNewConvo, useGetConversation, store.conversationXxxByIndex)
 * was already index-aware; the picker UI just wasn't surfacing it.
 */
export default function AddedConvo({
  addedConvo,
  setAddedConvo,
}: {
  addedConvo: TConversation | null;
  setAddedConvo: SetterOrUpdater<TConversation | null>;
}) {
  const { data: startupConfig } = useGetStartupConfig();

  if (!addedConvo) {
    return null;
  }
  return (
    <div className="flex items-center gap-2 py-2 pl-2 pr-1.5 text-sm">
      <span className="flex-shrink-0 select-none font-semibold text-text-secondary">+</span>
      <div className="min-w-0 flex-1">
        <ModelSelector startupConfig={startupConfig} index={1} />
      </div>
      <button
        className="text-token-text-secondary flex-shrink-0"
        type="button"
        aria-label="Close added conversation"
        onClick={() => setAddedConvo(null)}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          fill="none"
          viewBox="0 0 24 24"
          className="icon-lg"
          aria-hidden="true"
        >
          <path
            fill="currentColor"
            fillRule="evenodd"
            d="M7.293 7.293a1 1 0 0 1 1.414 0L12 10.586l3.293-3.293a1 1 0 1 1 1.414 1.414L13.414 12l3.293 3.293a1 1 0 0 1-1.414 1.414L12 13.414l-3.293 3.293a1 1 0 0 1-1.414-1.414L10.586 12 7.293 8.707a1 1 0 0 1 0-1.414"
            clipRule="evenodd"
          ></path>
        </svg>
      </button>
    </div>
  );
}
