import { stripPlanMarkers, type PlanStepWire } from '../novaPlan';

/**
 * Bosong 2026-05-12 reproduction. The server-side planner now honours
 * the request-language directive and emits Chinese step labels in the
 * `<<<NOVA_PLAN:base64-json>>>` marker. Before this fix the marker's
 * base64 was decoded as a binary string and fed directly to
 * JSON.parse — each byte of a UTF-8 multi-byte sequence became its own
 * Latin-1 codepoint, so "搜索知识库" rendered as "æœç´¢ç¥è¯åº" in
 * the Progress sidebar.
 */
const encodeMarker = (steps: PlanStepWire[]): string => {
  const json = JSON.stringify(steps);
  // Use Node's Buffer to mirror what the Go server does — UTF-8 bytes
  // first, then base64. The browser runtime equivalent is
  // `btoa(String.fromCharCode(...new TextEncoder().encode(json)))`,
  // but TextEncoder isn't in Jest's default global scope.
  const b64 = Buffer.from(json, 'utf-8').toString('base64');
  return `<<<NOVA_PLAN:${b64}>>>`;
};

describe('stripPlanMarkers — UTF-8 preservation', () => {
  it('decodes Chinese step labels without mojibake', () => {
    const steps: PlanStepWire[] = [
      {
        id: 't1',
        description: '搜索知识库的中文语文内容',
        capability: 'document_search',
      },
      {
        id: 't2',
        description: '分析内容的年龄适用性',
        capability: 'data_analysis',
      },
    ];
    const text = encodeMarker(steps);

    let reported: PlanStepWire[] | null = null;
    const out = stripPlanMarkers(text, (s) => {
      reported = s;
    });

    expect(out).toBe('');
    expect(reported).not.toBeNull();
    expect(reported).toHaveLength(2);
    expect(reported![0].description).toBe('搜索知识库的中文语文内容');
    expect(reported![1].description).toBe('分析内容的年龄适用性');
    // Mojibake check — if UTF-8 decoding regresses to atob alone, the
    // description string would contain Latin-1 chars like "æ" instead.
    expect(reported![0].description).not.toMatch(/[ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖØÙÚÛÜÝÞß]/);
  });

  it('still works for ASCII step labels', () => {
    const steps: PlanStepWire[] = [
      { id: 't1', description: 'Search knowledge base', capability: 'document_search' },
    ];
    const text = `prefix ${encodeMarker(steps)} suffix`;

    let reported: PlanStepWire[] | null = null;
    const out = stripPlanMarkers(text, (s) => {
      reported = s;
    });

    expect(out).toBe('prefix  suffix');
    expect(reported).not.toBeNull();
    expect(reported![0].description).toBe('Search knowledge base');
  });

  it('drops malformed base64 silently', () => {
    const text = '<<<NOVA_PLAN:!!!notbase64!!!>>>';
    let reported: PlanStepWire[] | null = null;
    // The regex itself only matches A-Z a-z 0-9 + / =, so a marker with
    // "!!!" inside won't even be picked up — verify behaviour is no-op.
    const out = stripPlanMarkers(text, (s) => {
      reported = s;
    });
    expect(out).toBe(text);
    expect(reported).toBeNull();
  });
});
