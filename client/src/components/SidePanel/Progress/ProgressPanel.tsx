import { memo, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { useRecoilState, useRecoilValue } from 'recoil';
import { Constants } from 'librechat-data-provider';
import { Check, AlertCircle, Loader2, ChevronRight, ChevronLeft } from 'lucide-react';
import type { PhaseEvent, PlanStep } from '~/store/progress';
import type { PhaseRow, StepRow as StepRowType } from '~/utils';
import { useGetStartupConfig } from '~/data-provider';
import { mergePhasesAndSteps, resolveLabel } from '~/utils';
import { useLocalize } from '~/hooks';
import store from '~/store';

type IndicatorTextConfig = string | Record<string, string> | undefined;
type PhaseTable = Record<string, string | Record<string, string>> | undefined;

/**
 * Nova OS fork — right-side "Progress" sidebar showing the agent's
 * activity as a single unified timeline. Phase events from the wire
 * (`<<<NOVA_PHASE:...>>>` markers — `planning`, `tool:<capability>`,
 * `tool:<function>`, `synthesizing`) are merged with planner-derived
 * BrainTask rows so a 1-task query still produces ~4 visible rows.
 *
 * Driven by `planStepsAtom` + `phaseEventsAtom`, populated by the SSE
 * marker stripper in useEventHandlers / useStepHandler. Hidden when both
 * are empty — no plan, no panel.
 *
 * Two display modes:
 *   - Expanded: 320px panel with header (current phase + completed count),
 *     unified timeline, elapsed time on the active step.
 *   - Collapsed: 32px rail with a vertical "Progress" label + active-step
 *     count badge so activity stays glanceable.
 */
const ProgressPanel = memo(function ProgressPanel() {
  const { conversationId = Constants.NEW_CONVO } = useParams<{ conversationId?: string }>();
  const planSteps = useRecoilValue(store.planStepsByConvoFamily(conversationId));
  const phaseEvents = useRecoilValue(store.phaseEventsByConvoFamily(conversationId));
  const currentPhase = useRecoilValue(store.currentPhaseByConvoFamily(conversationId));
  const [collapsed, setCollapsed] = useRecoilState(store.progressPanelCollapsedAtom);
  const localize = useLocalize();
  const { i18n } = useTranslation();
  const { data: startupConfig } = useGetStartupConfig();
  const indicatorText = startupConfig?.interface?.typingIndicatorText as IndicatorTextConfig;
  const phases = startupConfig?.interface?.typingIndicatorPhases as PhaseTable;

  const rows = useMemo(
    () => mergePhasesAndSteps(phaseEvents, planSteps, currentPhase != null),
    [phaseEvents, planSteps, currentPhase],
  );

  const doneCount = planSteps.filter((s) => s.status === 'done').length;
  const activeCount = planSteps.filter((s) => s.status === 'active').length;
  const totalSteps = planSteps.length;
  const hasContent = rows.length > 0;

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
          ) : totalSteps > 0 ? (
            <span className="text-[10px] text-text-tertiary">
              {doneCount}/{totalSteps}
            </span>
          ) : null}
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
            hasContent={hasContent}
            doneCount={doneCount}
            totalCount={totalSteps}
            phases={phases}
            indicatorText={indicatorText}
            language={i18n.language}
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
        {rows.map((row, index) =>
          row.kind === 'phase' ? (
            <PhaseRowView
              key={`phase-${row.key}-${row.ts}`}
              row={row}
              phases={phases}
              language={i18n.language}
            />
          ) : (
            <StepRowView
              key={`step-${row.step.id}`}
              row={row}
              index={planStepIndex(rows, index)}
              phases={phases}
              language={i18n.language}
            />
          ),
        )}
      </ol>
    </aside>
  );
});

ProgressPanel.displayName = 'ProgressPanel';

function planStepIndex(rows: ReturnType<typeof mergePhasesAndSteps>, upTo: number): number {
  let n = 0;
  for (let i = 0; i <= upTo; i++) {
    if (rows[i].kind === 'step') {
      n += 1;
    }
  }
  return n;
}

function PanelSubtitle({
  currentPhase,
  hasContent,
  doneCount,
  totalCount,
  phases,
  indicatorText,
  language,
  localize,
}: {
  currentPhase: string | null;
  hasContent: boolean;
  doneCount: number;
  totalCount: number;
  phases: PhaseTable;
  indicatorText: IndicatorTextConfig;
  language: string;
  localize: ReturnType<typeof useLocalize>;
}) {
  const counter =
    totalCount > 0
      ? localize('com_ui_progress_completed_count', {
          done: String(doneCount),
          total: String(totalCount),
        })
      : null;
  // Streaming → resolve current phase label (falls back to indicatorText
  // like "Thinking…"). Stream ended (currentPhase null) but panel has
  // rows → "Done". Empty pre-submission → no subtitle at all.
  let phaseLabel: string | undefined;
  if (currentPhase != null) {
    phaseLabel = resolveLabel(currentPhase, phases, indicatorText, language);
  } else if (hasContent) {
    phaseLabel = localize('com_ui_done');
  }
  const parts = [counter, phaseLabel].filter((s): s is string => !!s);
  if (parts.length === 0) {
    return null;
  }
  return (
    <span className="truncate text-xs text-text-secondary" title={phaseLabel ?? undefined}>
      {parts.join(' · ')}
    </span>
  );
}

function PhaseRowView({
  row,
  phases,
  language,
}: {
  row: PhaseRow;
  phases: PhaseTable;
  language: string;
}) {
  const label = resolveLabel(row.key, phases, undefined, language) ?? row.key;
  const isActive = row.status === 'active';
  return (
    <li className="flex items-start gap-3 py-2">
      <PhaseBadge active={isActive} />
      <span
        className={`line-clamp-2 text-sm leading-tight ${
          isActive
            ? 'text-text-primary'
            : 'text-text-tertiary line-through'
        }`}
      >
        {label}
      </span>
    </li>
  );
}

function PhaseBadge({ active }: { active: boolean }) {
  return (
    <span
      aria-hidden
      className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full ${
        active
          ? 'border border-blue-500 bg-surface-primary text-blue-500'
          : 'bg-blue-500 text-white'
      }`}
    >
      {active ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} strokeWidth={3} />}
    </span>
  );
}

function StepRowView({
  row,
  index,
  phases,
  language,
}: {
  row: StepRowType;
  index: number;
  phases: PhaseTable;
  language: string;
}) {
  const { step, children } = row;
  const isDone = step.status === 'done';
  const isError = step.status === 'error';
  const isActive = step.status === 'active';
  return (
    <li className="py-2">
      <div className="flex items-start gap-3">
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
      </div>
      {children.length > 0 && (
        <ul className="ml-7 mt-1 border-l border-border-light pl-3">
          {children.map((child) => (
            <ChildPhaseRow
              key={`${child.key}-${child.ts}`}
              event={child}
              phases={phases}
              language={language}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function ChildPhaseRow({
  event,
  phases,
  language,
}: {
  event: PhaseEvent;
  phases: PhaseTable;
  language: string;
}) {
  const label = resolveLabel(event.key, phases, undefined, language) ?? event.key;
  return (
    <li className="flex items-center gap-2 py-1 text-xs text-text-tertiary">
      <Check size={11} strokeWidth={3} aria-hidden className="flex-shrink-0 text-blue-500" />
      <span className="line-clamp-1 line-through">{label}</span>
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
