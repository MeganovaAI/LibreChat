import type { PhaseEvent, PlanStep } from '~/store/progress';
import { mergePhasesAndSteps } from './progress';

const phase = (key: string, ts: number): PhaseEvent => ({ key, ts });

const step = (
  id: string,
  capability: string,
  status: PlanStep['status'] = 'pending',
): PlanStep => ({
  id,
  description: `step ${id}`,
  capability,
  status,
});

describe('mergePhasesAndSteps', () => {
  it('returns empty when both inputs empty', () => {
    expect(mergePhasesAndSteps([], [])).toEqual([]);
  });

  it('renders only phase rows when no plan steps', () => {
    const events: PhaseEvent[] = [
      phase('planning', 1),
      phase('tool:web_search', 2),
      phase('synthesizing', 3),
    ];
    const rows = mergePhasesAndSteps(events, []);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ kind: 'phase', key: 'planning', status: 'done' });
    expect(rows[1]).toMatchObject({ kind: 'phase', key: 'tool:web_search', status: 'done' });
    expect(rows[2]).toMatchObject({ kind: 'phase', key: 'synthesizing', status: 'active' });
  });

  it('marks the latest phase active and earlier ones done', () => {
    const rows = mergePhasesAndSteps([phase('planning', 1)], []);
    expect(rows[0]).toMatchObject({ kind: 'phase', status: 'active' });
  });

  it('marks all phases done when streaming has ended', () => {
    const events = [phase('planning', 1), phase('synthesizing', 2)];
    const rows = mergePhasesAndSteps(events, [], false);
    expect(rows[0]).toMatchObject({ kind: 'phase', key: 'planning', status: 'done' });
    expect(rows[1]).toMatchObject({ kind: 'phase', key: 'synthesizing', status: 'done' });
  });

  it('places plan steps between planning and synthesizing', () => {
    const events = [phase('planning', 1), phase('synthesizing', 5)];
    const steps = [step('a', 'web'), step('b', 'kb')];
    const rows = mergePhasesAndSteps(events, steps);
    expect(rows.map((r) => r.kind)).toEqual(['phase', 'step', 'step', 'phase']);
    expect((rows[0] as { key: string }).key).toBe('planning');
    expect((rows[3] as { key: string }).key).toBe('synthesizing');
  });

  it('suppresses tool:<capability> events that match a plan step', () => {
    const events = [
      phase('planning', 1),
      phase('tool:web', 2),
      phase('tool:tavily_search', 3),
      phase('synthesizing', 4),
    ];
    const steps = [step('a', 'web')];
    const rows = mergePhasesAndSteps(events, steps);
    const stepRow = rows.find((r) => r.kind === 'step') as Extract<
      ReturnType<typeof mergePhasesAndSteps>[number],
      { kind: 'step' }
    >;
    expect(stepRow.children).toHaveLength(1);
    expect(stepRow.children[0].key).toBe('tool:tavily_search');
  });

  it('attaches inner tool:<function> events to the most recent matching step', () => {
    const events = [
      phase('planning', 1),
      phase('tool:web', 2),
      phase('tool:tavily_search', 3),
      phase('tool:kb', 4),
      phase('tool:knowledge_search', 5),
      phase('synthesizing', 6),
    ];
    const steps = [step('a', 'web'), step('b', 'kb')];
    const rows = mergePhasesAndSteps(events, steps);
    const stepRows = rows.filter((r) => r.kind === 'step') as Array<
      Extract<ReturnType<typeof mergePhasesAndSteps>[number], { kind: 'step' }>
    >;
    expect(stepRows[0].children.map((c) => c.key)).toEqual(['tool:tavily_search']);
    expect(stepRows[1].children.map((c) => c.key)).toEqual(['tool:knowledge_search']);
  });

  it('omits phase rows when only those phases never arrived', () => {
    const events = [phase('tool:web_search', 2)];
    const rows = mergePhasesAndSteps(events, []);
    expect(rows.map((r) => (r as { key: string }).key)).toEqual(['tool:web_search']);
  });
});
