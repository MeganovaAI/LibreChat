import {
  applyPlanStepTransition,
  scrubPlanMarkersFromMessage,
  stripPlanMarkers,
  stripStepMarkers,
} from './novaPlan';
import type { PlanStepStatus, PlanStepWire } from './novaPlan';
import type { PlanStep } from '~/store/progress';

describe('stripPlanMarkers (live streaming)', () => {
  it('parses base64 JSON plan and reports steps', () => {
    const plan: PlanStepWire[] = [
      { id: 't1', description: '检索知识库', capability: 'document_search' },
    ];
    const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(plan))));
    const reported: PlanStepWire[][] = [];
    const cleaned = stripPlanMarkers(
      `prefix<<<NOVA_PLAN:${b64}>>>suffix`,
      (steps) => reported.push(steps),
    );
    expect(cleaned).toBe('prefixsuffix');
    expect(reported).toHaveLength(1);
    expect(reported[0][0].id).toBe('t1');
    expect(reported[0][0].description).toBe('检索知识库');
  });

  it('does not strip a dangling/unterminated plan marker during live streaming', () => {
    const reported: PlanStepWire[][] = [];
    const dangling = 'partial<<<NOVA_PLAN:W3siaWQ';
    const cleaned = stripPlanMarkers(dangling, (steps) => reported.push(steps));
    expect(cleaned).toBe(dangling);
    expect(reported).toEqual([]);
  });
});

describe('stripStepMarkers (live streaming)', () => {
  it('reports each transition in order', () => {
    const transitions: [string, PlanStepStatus][] = [];
    const cleaned = stripStepMarkers(
      '<<<NOVA_STEP:t1:started>>>working<<<NOVA_STEP:t1:done>>>more',
      (id, status) => transitions.push([id, status]),
    );
    expect(cleaned).toBe('workingmore');
    expect(transitions).toEqual([
      ['t1', 'started'],
      ['t1', 'done'],
    ]);
  });

  it('leaves dangling step marker untouched at streaming time', () => {
    const transitions: [string, PlanStepStatus][] = [];
    const dangling = 'before<<<NOVA_STEP:t1:start';
    const cleaned = stripStepMarkers(dangling, (id, status) =>
      transitions.push([id, status]),
    );
    expect(cleaned).toBe(dangling);
    expect(transitions).toEqual([]);
  });
});

describe('scrubPlanMarkersFromMessage truncation handling', () => {
  it('strips well-formed plan + step markers from .text', () => {
    const m = {
      text: 'foo<<<NOVA_PLAN:eyJpZCI6InQxIn0=>>>bar<<<NOVA_STEP:t1:done>>>baz',
    } as { text: string };
    scrubPlanMarkersFromMessage(m as never);
    expect(m.text).toBe('foobarbaz');
  });

  it('strips a dangling NOVA_PLAN with a long base64 payload at end of text', () => {
    const dangling =
      '<<<NOVA_PLAN:W3siaWQiOiJ0MSIsImRlc2NyaXB0aW9uIjoi55Sf5oiQS0NIIHggQ0RDIOWPjOagh+WHhui/h+aVj+euoeeQhuWvueeFp+ihqERPQ1ggZG9jdW1lbnQiLCJjYX';
    const m = {
      text: `Something went wrong before close ${dangling}`,
    } as { text: string };
    scrubPlanMarkersFromMessage(m as never);
    expect(m.text).toBe('Something went wrong before close ');
  });

  it('strips a dangling NOVA_STEP at end of text', () => {
    const m = { text: 'mid-stream<<<NOVA_STEP:t1:start' } as { text: string };
    scrubPlanMarkersFromMessage(m as never);
    expect(m.text).toBe('mid-stream');
  });

  it('strips both an earlier well-formed marker AND a dangling final one', () => {
    const m = {
      text: '<<<NOVA_STEP:t1:started>>>doing work<<<NOVA_PLAN:abcDEF12',
    } as { text: string };
    scrubPlanMarkersFromMessage(m as never);
    expect(m.text).toBe('doing work');
  });

  it('strips dangling marker inside content[].text shape (the actual storage path)', () => {
    const m = {
      content: [
        { type: 'text', text: 'reply text<<<NOVA_PLAN:W3siaWQ' },
      ],
    } as { content: { type: string; text: string }[] };
    scrubPlanMarkersFromMessage(m as never);
    expect((m.content[0] as { text: string }).text).toBe('reply text');
  });

  it('is a no-op when no markers are present', () => {
    const m = { text: '<<<not a nova marker>>>' } as { text: string };
    scrubPlanMarkersFromMessage(m as never);
    expect(m.text).toBe('<<<not a nova marker>>>');
  });
});

describe('applyPlanStepTransition', () => {
  const baseStep: PlanStep = {
    id: 't1',
    description: 'check kb',
    capability: 'document_search',
    status: 'pending',
  };

  it('moves pending → active on started and stamps startedAt', () => {
    const out = applyPlanStepTransition([baseStep], 't1', 'started');
    expect(out[0].status).toBe('active');
    expect(out[0].startedAt).toBeGreaterThan(0);
  });

  it('moves active → done on done and stamps completedAt', () => {
    const active: PlanStep = { ...baseStep, status: 'active', startedAt: 1 };
    const out = applyPlanStepTransition([active], 't1', 'done');
    expect(out[0].status).toBe('done');
    expect(out[0].completedAt).toBeGreaterThan(0);
  });

  it('leaves unmatched step IDs untouched', () => {
    const out = applyPlanStepTransition([baseStep], 'other', 'done');
    expect(out[0].status).toBe('pending');
  });
});
