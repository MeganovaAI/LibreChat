import { memo } from 'react';
import { Check, AlertCircle, Loader2 } from 'lucide-react';
import { useRecoilValue } from 'recoil';
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
 * Fixed-position drawer (right edge) so it doesn't fight LibreChat's
 * existing ResizablePanelGroup layout used by ArtifactsPanel.
 */
const ProgressPanel = memo(function ProgressPanel() {
  const planSteps = useRecoilValue(store.planStepsAtom);
  const localize = useLocalize();

  if (planSteps.length === 0) {
    return null;
  }

  return (
    <aside
      className="fixed right-0 top-16 z-40 hidden w-80 max-w-[90vw] overflow-hidden rounded-l-lg border border-border-medium bg-surface-primary shadow-lg md:block"
      aria-label={localize('com_ui_progress')}
    >
      <header className="border-b border-border-light bg-surface-secondary px-4 py-3">
        <h2 className="text-sm font-semibold text-text-primary">
          {localize('com_ui_progress')}
        </h2>
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
    </li>
  );
}

export default ProgressPanel;
