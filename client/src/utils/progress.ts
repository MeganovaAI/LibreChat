import type { PhaseEvent, PlanStep } from '~/store/progress';

export type PhaseRow = {
  kind: 'phase';
  key: string;
  ts: number;
  status: 'active' | 'done';
};

export type StepRow = {
  kind: 'step';
  step: PlanStep;
  children: PhaseEvent[];
};

export type TimelineRow = PhaseRow | StepRow;

const TOP_LEVEL_PHASES = new Set<string>(['planning', 'synthesizing']);

function capabilityFromToolPhase(key: string): string | null {
  if (!key.startsWith('tool:')) {
    return null;
  }
  return key.slice('tool:'.length);
}

/**
 * Merge phase events and plan steps into a single ordered timeline. The
 * design is deliberately one-pass and pure so it can be memoized in the
 * panel and unit-tested without React.
 *
 * `streaming` — when false, the response is no longer in flight (final/
 * cancel/error already fired) and no phase row should render as
 * "active". When true and there is a latest phase, that one is "active".
 *
 * Layout:
 *   - `planning` and `synthesizing` are top-level rows with their own
 *     phase status (the latest of these is "active" while streaming,
 *     earlier are "done").
 *   - Each plan step renders as its own row in submission order; inner
 *     `tool:<function>` events that arrived AFTER the step started but
 *     BEFORE the next step started are nested as children of that step.
 *   - `tool:<capability>` events that match a step's capability are
 *     suppressed (they would duplicate the step row itself); all other
 *     `tool:*` events become children of the most recently started step.
 *   - If there are no plan steps, all `tool:*` events render as
 *     standalone phase rows so simple queries still get visible activity.
 */
export function mergePhasesAndSteps(
  phaseEvents: PhaseEvent[],
  planSteps: PlanStep[],
  streaming: boolean = true,
): TimelineRow[] {
  const rows: TimelineRow[] = [];

  const planningEvent = phaseEvents.find((e) => e.key === 'planning');
  const synthesizingEvent = phaseEvents.find((e) => e.key === 'synthesizing');
  const latestKey =
    streaming && phaseEvents.length > 0 ? phaseEvents[phaseEvents.length - 1].key : null;

  if (planningEvent) {
    rows.push({
      kind: 'phase',
      key: planningEvent.key,
      ts: planningEvent.ts,
      status: latestKey === 'planning' ? 'active' : 'done',
    });
  }

  if (planSteps.length === 0) {
    for (const e of phaseEvents) {
      if (TOP_LEVEL_PHASES.has(e.key)) {
        continue;
      }
      rows.push({
        kind: 'phase',
        key: e.key,
        ts: e.ts,
        status: latestKey === e.key ? 'active' : 'done',
      });
    }
  } else {
    const stepCapabilities = new Set(planSteps.map((s) => s.capability));
    const childBuckets: PhaseEvent[][] = planSteps.map(() => []);
    let currentStepIdx = -1;

    for (const e of phaseEvents) {
      if (TOP_LEVEL_PHASES.has(e.key)) {
        continue;
      }
      const cap = capabilityFromToolPhase(e.key);
      if (cap && stepCapabilities.has(cap)) {
        const idx = planSteps.findIndex((s) => s.capability === cap);
        if (idx >= 0) {
          currentStepIdx = idx;
        }
        continue;
      }
      if (currentStepIdx >= 0) {
        childBuckets[currentStepIdx].push(e);
      }
    }

    planSteps.forEach((step, i) => {
      rows.push({ kind: 'step', step, children: childBuckets[i] });
    });
  }

  if (synthesizingEvent) {
    rows.push({
      kind: 'phase',
      key: synthesizingEvent.key,
      ts: synthesizingEvent.ts,
      status: latestKey === 'synthesizing' ? 'active' : 'done',
    });
  }

  return rows;
}
