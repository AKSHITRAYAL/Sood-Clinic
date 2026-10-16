import { describe, expect, it } from 'vitest';
import { planPlacement } from '../../lib/engine/placement.js';

const now = new Date('2026-10-12T00:00:00.000Z');

describe('unit placement planning', () => {
  it('accepts free units and ignores expired holds', () => {
    expect(planPlacement({ candidateUnitIds: ['a', 'b'], existingUnits: new Map(), now })).toEqual({ ok: true });
    expect(planPlacement({
      candidateUnitIds: ['a'],
      existingUnits: new Map([['a', { kind: 'hold', expiresAt: new Date('2026-10-11T23:59:00.000Z') }]]),
      now,
    })).toEqual({ ok: true });
  });

  it('returns the first active conflict', () => {
    expect(planPlacement({
      candidateUnitIds: ['a', 'b'],
      existingUnits: new Map([['b', { kind: 'core' }]]),
      now,
    })).toEqual({ ok: false, conflictUnitId: 'b' });
    expect(planPlacement({
      candidateUnitIds: ['a'],
      existingUnits: new Map([['a', { kind: 'hold', expiresAt: new Date('2026-10-12T00:01:00.000Z') }]]),
      now,
    }).ok).toBe(false);
  });

  it('lets a guest confirm the units its own hold locked', () => {
    const existingUnits = new Map([['a', { kind: 'hold', holdId: 'hold-hash', expiresAt: new Date('2026-10-12T00:10:00.000Z') }]]);
    expect(planPlacement({ candidateUnitIds: ['a'], existingUnits, now, claimHoldId: 'hold-hash' })).toEqual({ ok: true });
    expect(planPlacement({ candidateUnitIds: ['a'], existingUnits, now, claimHoldId: 'another-hash' }).ok).toBe(false);
    expect(planPlacement({ candidateUnitIds: ['a'], existingUnits, now }).ok).toBe(false);
  });

  it('keeps an appointment own units when it is moved or rescheduled', () => {
    const existingUnits = new Map([['a', { kind: 'core', appointmentId: 'appointment-one' }]]);
    expect(planPlacement({ candidateUnitIds: ['a'], existingUnits, now, claimAppointmentId: 'appointment-one' })).toEqual({ ok: true });
    expect(planPlacement({ candidateUnitIds: ['a'], existingUnits, now, claimAppointmentId: 'appointment-two' }).ok).toBe(false);
  });
});
