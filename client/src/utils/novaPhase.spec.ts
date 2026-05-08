import { resolveLabel, stripPhaseMarkers, stripPhaseMarkersAll } from './novaPhase';

describe('stripPhaseMarkersAll', () => {
  it('reports each marker in order and returns cleaned text', () => {
    const seen: string[] = [];
    const result = stripPhaseMarkersAll(
      'foo<<<NOVA_PHASE:planning>>>bar<<<NOVA_PHASE:tool:web_search>>>baz<<<NOVA_PHASE:synthesizing>>>',
      (k) => seen.push(k),
    );
    expect(seen).toEqual(['planning', 'tool:web_search', 'synthesizing']);
    expect(result).toBe('foobarbaz');
  });

  it('is idempotent on text with no markers', () => {
    const seen: string[] = [];
    const result = stripPhaseMarkersAll('plain text with no markers', (k) => seen.push(k));
    expect(seen).toEqual([]);
    expect(result).toBe('plain text with no markers');
  });

  it('handles a single marker', () => {
    const seen: string[] = [];
    const result = stripPhaseMarkersAll('<<<NOVA_PHASE:planning>>>start', (k) => seen.push(k));
    expect(seen).toEqual(['planning']);
    expect(result).toBe('start');
  });

  it('handles empty input safely', () => {
    const seen: string[] = [];
    expect(stripPhaseMarkersAll('', (k) => seen.push(k))).toBe('');
    expect(seen).toEqual([]);
  });
});

describe('stripPhaseMarkers (single-latest)', () => {
  it('reports only the last marker in the buffer', () => {
    const seen: string[] = [];
    stripPhaseMarkers(
      '<<<NOVA_PHASE:planning>>><<<NOVA_PHASE:tool:web_search>>><<<NOVA_PHASE:synthesizing>>>',
      (k) => seen.push(k),
    );
    expect(seen).toEqual(['synthesizing']);
  });

  it('does not invoke reporter when no markers present', () => {
    const seen: string[] = [];
    stripPhaseMarkers('hello world', (k) => seen.push(k));
    expect(seen).toEqual([]);
  });
});

describe('resolveLabel', () => {
  const phases = {
    planning: { en: 'Planning…', 'zh-CN': '规划中…' },
    synthesizing: 'Composing answer',
    'tool:*': { en: 'Running {tool}…', default: 'Running {tool}' },
  };

  it('returns exact-match label for a known phase', () => {
    expect(resolveLabel('planning', phases, undefined, 'en')).toBe('Planning…');
  });

  it('falls back to language prefix when full locale missing', () => {
    expect(resolveLabel('planning', phases, undefined, 'zh-CN')).toBe('规划中…');
  });

  it('expands tool:* template with tool name substitution', () => {
    expect(resolveLabel('tool:web_search', phases, undefined, 'en')).toBe('Running web_search…');
  });

  it('falls through to text when no phase match', () => {
    expect(resolveLabel(null, phases, 'Working…', 'en')).toBe('Working…');
  });

  it('returns undefined when nothing resolves', () => {
    expect(resolveLabel(null, undefined, undefined, 'en')).toBeUndefined();
  });
});
