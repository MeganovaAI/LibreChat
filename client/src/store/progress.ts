import { atomFamily } from 'recoil';
import { atomWithLocalStorage } from './utils';

export type PlanStepStatus = 'pending' | 'active' | 'done' | 'error';

export type PlanStep = {
  id: string;
  description: string;
  capability: string;
  status: PlanStepStatus;
  startedAt?: number;
  completedAt?: number;
};

/**
 * Nova OS fork — one entry per `<<<NOVA_PHASE:key>>>` marker observed in
 * the streamed text, with the client-side timestamp of arrival. Used to
 * render an activity timeline in ProgressPanel alongside plan-step rows.
 * Distinct from `currentPhaseByConvoFamily` which keeps only the latest
 * key for the typing-indicator subtitle.
 */
export type PhaseEvent = {
  key: string;
  ts: number;
};

/**
 * Nova OS fork — planSteps keyed by conversationId so each chat owns its
 * own ProgressPanel state. New chats stream into the `Constants.NEW_CONVO`
 * key; once the server returns a real UUID, useEventHandlers.finalHandler
 * migrates the entry to that UUID just before navigating. Switching chats
 * naturally swaps to the target chat's stored content because ProgressPanel
 * reads `useParams().conversationId`. In-memory only — page reload empties
 * everything, which matches the ephemeral nature of progress UI.
 */
const planStepsByConvoFamily = atomFamily<PlanStep[], string>({
  key: 'planStepsByConvo',
  default: [],
});

/**
 * Nova OS fork — append-only list of phase events for the current turn,
 * keyed by conversationId. Same lifecycle as `planStepsByConvoFamily` —
 * reset at submission start, migrated on new-chat completion.
 */
const phaseEventsByConvoFamily = atomFamily<PhaseEvent[], string>({
  key: 'phaseEventsByConvo',
  default: [],
});

/**
 * Nova OS fork — user-controlled collapsed/expanded preference for the
 * right-side ProgressPanel. Singleton (not per-chat) because it is a
 * UI preference, not progress data. Persisted across sessions.
 */
const progressPanelCollapsedAtom = atomWithLocalStorage<boolean>(
  'progressPanelCollapsed',
  false,
);

const progress = {
  planStepsByConvoFamily,
  phaseEventsByConvoFamily,
  progressPanelCollapsedAtom,
};
export default progress;
