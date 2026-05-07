import { atom } from 'recoil';
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
 * Nova OS fork — planStepsAtom holds the upstream agent's planned task
 * list along with each step's current lifecycle status and per-step
 * timing. Populated by the marker-stripper when a `<<<NOVA_PLAN:base64-json>>>`
 * arrives (typically once per turn, right after the planner finalizes).
 * Each `<<<NOVA_STEP:<task_id>:started|done|error>>>` marker transitions
 * the matching step's status and stamps `startedAt`/`completedAt` on the
 * client side. Read by `ProgressPanel` (right-side sidebar) and `StepList`
 * to render the current state.
 *
 * Reset to `[]` when a new submission starts — same trap-door as
 * `currentPhaseAtom` (reset in `useEventHandlers`, NOT in any component
 * `useEffect`, since panel components can remount multiple times within
 * a single message — see `EmptyText.tsx:96-105` for the cautionary tale).
 *
 * Single global atom — only one streaming response in-flight per user.
 */
const planStepsAtom = atom<PlanStep[]>({
  key: 'planSteps',
  default: [],
});

/**
 * Nova OS fork — user-controlled collapsed/expanded preference for the
 * right-side ProgressPanel. Persisted across sessions because it is a
 * deliberate UX choice (not transient state); a user who wants the rail
 * out of the way shouldn't have to re-collapse on every reload.
 *
 * `false` (expanded) is the default since the panel only mounts when
 * there is plan content to show in the first place.
 */
const progressPanelCollapsedAtom = atomWithLocalStorage<boolean>(
  'progressPanelCollapsed',
  false,
);

const progress = { planStepsAtom, progressPanelCollapsedAtom };
export default progress;
