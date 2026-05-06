import { atom } from 'recoil';

export type PlanStepStatus = 'pending' | 'active' | 'done' | 'error';

export type PlanStep = {
  id: string;
  description: string;
  capability: string;
  status: PlanStepStatus;
};

/**
 * Nova OS fork — planStepsAtom holds the upstream agent's planned task
 * list along with each step's current lifecycle status.
 *
 * Populated by the marker-stripper when a `<<<NOVA_PLAN:base64-json>>>`
 * arrives (typically once per turn, right after the planner finalizes).
 * Each subsequent `<<<NOVA_STEP:<task_id>:started|done|error>>>` marker
 * transitions the matching step's `status`. Read by `ProgressPanel`
 * (right-side sidebar) and `StepList` to render the current state.
 *
 * Reset to `[]` when a new submission starts — same trap-door as
 * `currentPhaseAtom` (reset in `useEventHandlers`, NOT in any component
 * `useEffect`, since panel components can remount multiple times within
 * a single message — see `EmptyText.tsx:96-105` for the cautionary
 * tale).
 *
 * Single global atom — only one streaming response in-flight per user.
 */
const planStepsAtom = atom<PlanStep[]>({
  key: 'planSteps',
  default: [],
});

const progress = { planStepsAtom };
export default progress;
