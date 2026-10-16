import { describe, expect, it } from 'vitest';
import { istInstant } from '../../lib/ist.js';
import { GRID_MINUTES, alignDown, alignUp, istUnitId, unitIdsForRange, unitSlotsForRange } from '../../lib/engine/units.js';

describe('scheduler units', () => {
  it('uses five-minute IST unit ids', () => {
    expect(GRID_MINUTES).toBe(5);
    expect(istUnitId('doc', istInstant('2026-10-12', '08:05'))).toBe('doc_202610120805');
  });

  it('aligns ranges down at the start and up at the end', () => {
    const start = new Date('2026-10-12T02:33:00.000Z');
    const end = new Date('2026-10-12T03:07:00.000Z');
    expect(alignDown(start).toISOString()).toBe('2026-10-12T02:30:00.000Z');
    expect(alignUp(end).toISOString()).toBe('2026-10-12T03:10:00.000Z');
    expect(unitIdsForRange('doc', start, end)).toHaveLength(8);
  });

  it('locks eight units for a forty-minute booking and eleven with both buffers', () => {
    const startsAt = istInstant('2026-10-12', '08:00');
    const endsAt = new Date(startsAt.getTime() + 40 * 60 * 1000);
    const core = unitSlotsForRange('doc', startsAt, endsAt);
    expect(core).toHaveLength(8);
    expect(core[0].id).toBe('doc_202610120800');
    expect(core.at(-1).id).toBe('doc_202610120835');
    expect(core.at(-1).endsAt.toISOString()).toBe(endsAt.toISOString());

    const buffered = unitSlotsForRange(
      'doc',
      new Date(startsAt.getTime() - 5 * 60 * 1000),
      new Date(endsAt.getTime() + 10 * 60 * 1000),
    );
    expect(buffered.map((unit) => unit.id)).toEqual([
      'doc_202610120755', 'doc_202610120800', 'doc_202610120805', 'doc_202610120810', 'doc_202610120815',
      'doc_202610120820', 'doc_202610120825', 'doc_202610120830', 'doc_202610120835', 'doc_202610120840',
      'doc_202610120845',
    ]);
  });
});
