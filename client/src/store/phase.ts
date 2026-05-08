import { atomFamily } from 'recoil';

/**
 * Nova OS fork — most recent phase key emitted by the upstream agent,
 * keyed by conversationId. Set by the marker-stripper in
 * useEventHandlers.messageHandler and useStepHandler.updateContent
 * whenever a <<<NOVA_PHASE:key>>> marker is seen in the streaming
 * content. Read by EmptyText to render a localized indicator and by
 * ProgressPanel to drive the "still streaming" flag for its merge
 * function. Reset to null on cancel/error/final so the next message
 * starts with the static fallback.
 *
 * Per-conversation so switching chats shows that chat's last phase.
 * Reset at submission start in useSSE.
 */
const currentPhaseByConvoFamily = atomFamily<string | null, string>({
  key: 'currentPhaseByConvo',
  default: null,
});

const phase = { currentPhaseByConvoFamily };
export default phase;
