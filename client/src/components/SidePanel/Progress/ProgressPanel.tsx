import { memo, useEffect, useState } from 'react';
import { useRecoilState, useRecoilValue } from 'recoil';
import { Check, AlertCircle, Loader2, ChevronRight, ChevronLeft } from 'lucide-react';
import type { PlanStep } from '~/store/progress';
import { useLocalize } from '~/hooks';
import store from '~/store';

/**
 * Nova OS fork — right-side "Progress" sidebar showing the agent's
 * planned steps with current lifecycle status. Surfaces what the AI is
 * doing during long pre-token waits so non-tech-savvy users (teachers,
 * parents on KCH-class deployments) understand the activity beyond a
 * dot + elapsed-time counter.
 *
 * Driven by `planStepsAtom`, populated by the SSE marker stripper in
 * useEventHandlers / useStepHandler from `<<<NOVA_PLAN:...>>>` and
 * `<<<NOVA_STEP:id:status>>>` markers. Hidden when the atom is empty
 * — no plan, no panel.
 *
 * Two display modes:
 *   - Expanded: 320px panel with header (current phase + completed count),
 *     ordered step list, elapsed time on the active step.
 *   - Collapsed: 32px rail with a vertical "Progress" label and a small
 *     active-count badge so the user still sees activity at a glance.
 *
 * Fixed-position drawer (right edge) so it doesn't fight LibreChat's
 * existing ResizablePanelGroup layout used by ArtifactsPanel. User's
 * collapsed/expanded preference persists across sessions.
 */
const ProgressPanel = memo(function ProgressPanel() {
  const planSteps = useRecoilValue(store.planStepsAtom);
  const currentPhase = useRecoilValue(store.currentPhaseAtom);
  const [collapsed, setCollapsed] = useRecoilState(store.progressPanelCollapsedAtom);
  const localize = useLocalize();

  if (planSteps.length === 0) {
    return null;
  }

  const doneCount = planSteps.filter((s) => s.status === 'done').length;
  const activeCount = planSteps.filter((s) => s.status === 'active').length;

  if (collapsed) {
    return (
      <aside
        className="fixed right-0 top-16 z-40 hidden md:block"
        aria-label={localize('com_ui_progress')}
      >
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          aria-label={localize('com_ui_progress_expand')}
          title={localize('com_ui_progress_expand')}
          className="flex h-32 w-8 flex-col items-center justify-between rounded-l-lg border border-r-0 border-border-medium bg-surface-primary py-3 shadow-lg hover:bg-surface-secondary"
        >
          <ChevronLeft size={14} className="text-text-secondary" />
          <span
            className="text-xs font-medium text-text-secondary"
            style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
          >
            {localize('com_ui_progress')}
          </span>
          {activeCount > 0 ? (
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-blue-500 text-[10px] font-semibold text-white">
              {activeCount}
            </span>
          ) : (
            <span className="text-[10px] text-text-tertiary">
              {doneCount}/{planSteps.length}
            </span>
          )}
        </button>
      </aside>
    );
  }

  return (
    <aside
      className="fixed right-0 top-16 z-40 hidden w-80 max-w-[90vw] overflow-hidden rounded-l-lg border border-border-medium bg-surface-primary shadow-lg md:block"
      aria-label={localize('com_ui_progress')}
    >
      <header className="flex items-center justify-between gap-2 border-b border-border-light bg-surface-secondary px-4 py-3">
        <div className="flex min-w-0 flex-col">
          <h2 className="text-sm font-semibold text-text-primary">
            {localize('com_ui_progress')}
          </h2>
          <PanelSubtitle
            currentPhase={currentPhase}
            doneCount={doneCount}
            totalCount={planSteps.length}
            localize={localize}
          />
        </div>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          aria-label={localize('com_ui_progress_collapse')}
          title={localize('com_ui_progress_collapse')}
          className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-text-secondary hover:bg-surface-tertiary hover:text-text-primary"
        >
          <ChevronRight size={16} />
        </button>
      </header>
      <ol className="max-h-[calc(100vh-12rem)] overflow-y-auto px-4 py-3">
        {planSteps.map((step, index) => (
          <StepRow key={step.id} step={step} index={index + 1} />
        ))}
      </ol>
    </aside>
  );
});

ProgressPanel.displayName = 'ProgressPanel';

function PanelSubtitle({
  currentPhase,
  doneCount,
  totalCount,
  localize,
}: {
  currentPhase: string | null;
  doneCount: number;
  totalCount: number;
  localize: ReturnType<typeof useLocalize>;
}) {
  const counter = localize('com_ui_progress_completed_count', {
    done: String(doneCount),
    total: String(totalCount),
  });
  if (!currentPhase) {
    return <span className="truncate text-xs text-text-secondary">{counter}</span>;
  }
  return (
    <span className="truncate text-xs text-text-secondary" title={currentPhase}>
      {counter} · {currentPhase}
    </span>
  );
}

function StepRow({ step, index }: { step: PlanStep; index: number }) {
  const isDone = step.status === 'done';
  const isError = step.status === 'error';
  const isActive = step.status === 'active';
  return (
    <li className="flex items-start gap-3 py-2">
      <span
        aria-hidden
        className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-xs font-medium ${
          isDone
            ? 'bg-blue-500 text-white'
            : isError
              ? 'bg-red-500 text-white'
              : isActive
                ? 'border border-blue-500 bg-surface-primary text-blue-500'
                : 'border border-border-medium bg-surface-primary text-text-tertiary'
        }`}
      >
        {isDone ? (
          <Check size={12} strokeWidth={3} />
        ) : isError ? (
          <AlertCircle size={12} strokeWidth={3} />
        ) : isActive ? (
          <Loader2 size={12} className="animate-spin" />
        ) : (
          index
        )}
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        <span
          className={`line-clamp-3 text-sm leading-tight ${
            isDone
              ? 'text-text-tertiary line-through'
              : isActive
                ? 'text-text-primary'
                : 'text-text-secondary'
          }`}
          title={step.description}
        >
          {step.description}
        </span>
        <StepTiming step={step} />
      </div>
    </li>
  );
}

function StepTiming({ step }: { step: PlanStep }) {
  const isActive = step.status === 'active';
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!isActive) {
      return;
    }
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [isActive]);

  if (isActive && step.startedAt != null) {
    const seconds = Math.max(0, Math.floor((now - step.startedAt) / 1000));
    if (seconds < 1) {
      return null;
    }
    return <span className="mt-0.5 text-[11px] text-text-tertiary">{seconds}s</span>;
  }
  if ((step.status === 'done' || step.status === 'error') && step.startedAt && step.completedAt) {
    const seconds = Math.max(0, Math.round((step.completedAt - step.startedAt) / 1000));
    if (seconds < 1) {
      return null;
    }
    return <span className="mt-0.5 text-[11px] text-text-tertiary">{seconds}s</span>;
  }
  return null;
}

export default ProgressPanel;
