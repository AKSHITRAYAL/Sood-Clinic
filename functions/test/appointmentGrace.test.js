import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import stateMachine from '../lib/stateMachine.js';
import ist from '../lib/ist.js';

const { TRANSITIONS, NO_SHOW_GRACE_MINUTES, canTransition, canMarkNoShow } = stateMachine;
const { istDateKey } = ist;

const start = new Date('2026-10-23T05:30:00.000Z');
const at = (minutes, seconds = 0) => new Date(start.getTime() + minutes * 60 * 1000 + seconds * 1000);
const appointment = (patch = {}) => ({ status: 'scheduled', startsAt: start, ...patch });

describe('no-show grace period', () => {
  it('allows exactly the grace boundary and nothing earlier', () => {
    expect(canMarkNoShow({ appointment: appointment(), now: at(NO_SHOW_GRACE_MINUTES), graceMinutes: NO_SHOW_GRACE_MINUTES })).toBe(true);
    expect(canMarkNoShow({ appointment: appointment(), now: at(NO_SHOW_GRACE_MINUTES, -1), graceMinutes: NO_SHOW_GRACE_MINUTES })).toBe(false);
    expect(canMarkNoShow({ appointment: appointment(), now: at(0), graceMinutes: 0 })).toBe(true);
    expect(canMarkNoShow({ appointment: appointment(), now: at(59) })).toBe(true);
  });

  it('accepts only scheduled or confirmed appointments', () => {
    for (const status of ['scheduled', 'confirmed']) expect(canMarkNoShow({ appointment: appointment({ status }), now: at(60) })).toBe(true);
    for (const status of ['checked_in', 'in_consultation', 'completed', 'cancelled', 'no_show', undefined]) {
      expect(canMarkNoShow({ appointment: appointment({ status }), now: at(60) })).toBe(false);
    }
    expect(canMarkNoShow({ now: at(60) })).toBe(false);
  });

  it('rejects unusable inputs instead of guessing', () => {
    for (const graceMinutes of [1.5, -1, 241, '15', null, undefined]) {
      expect(canMarkNoShow({ appointment: appointment(), now: at(60), graceMinutes: graceMinutes === undefined ? undefined : graceMinutes })).toBe(graceMinutes === undefined);
    }
    expect(canMarkNoShow({ appointment: { status: 'scheduled', startsAt: 'not-a-date' }, now: at(60) })).toBe(false);
    expect(canMarkNoShow({ appointment: appointment(), now: new Date('invalid') })).toBe(false);
    expect(canMarkNoShow({ appointment: appointment(), now: '2026-10-23T06:30:00.000Z' })).toBe(true);
  });

  it('reads Firestore timestamps through toDate', () => {
    expect(canMarkNoShow({ appointment: appointment({ startsAt: { toDate: () => start } }), now: at(60) })).toBe(true);
    expect(canMarkNoShow({ appointment: appointment({ startsAt: { toDate: () => new Date('invalid') } }), now: at(60) })).toBe(false);
  });
});

describe('check-in day condition', () => {
  it('compares the appointment IST date, not the UTC calendar date', () => {
    expect(istDateKey(start)).toBe('2026-10-23');
    // 19:00Z is already the next day in IST (00:30), so a UTC comparison would
    // accept a check-in that the callable must reject for 2026-10-23.
    const lateEvening = new Date('2026-10-23T19:00:00.000Z');
    expect(lateEvening.toISOString().slice(0, 10)).toBe('2026-10-23');
    expect(istDateKey(lateEvening)).toBe('2026-10-24');
    expect(appointment({ dateKey: '2026-10-23' }).dateKey === istDateKey(lateEvening)).toBe(false);
    expect(appointment({ dateKey: '2026-10-24' }).dateKey === istDateKey(lateEvening)).toBe(true);
  });
});

describe('frontend mirror parity', () => {
  it('the transition table is identical on both sides', async () => {
    const frontend = await import('../../Frontend/src/lib/appointmentState.js');
    for (const status of Object.keys(TRANSITIONS)) {
      for (const role of ['admin', 'manager', 'doctor', 'patient']) {
        const server = Object.entries(TRANSITIONS[status]).filter(([, roles]) => roles.includes(role)).map(([to]) => to);
        expect(frontend.allowedAppointmentTransitions(status, role), `${status}/${role}`).toEqual(server);
      }
    }
    expect(frontend.allowedAppointmentTransitions('completed', 'admin')).toEqual([]);
  });

  it('the frontend no-show rule agrees with the server at the same boundaries', async () => {
    const frontend = await import('../../Frontend/src/lib/appointmentState.js');
    expect(frontend.NO_SHOW_GRACE_MINUTES).toBe(NO_SHOW_GRACE_MINUTES);
    for (const offset of [-1, 0, 1, 30, 240]) {
      for (const stamp of [start, { toDate: () => start }]) {
        const now = at(offset);
        expect(frontend.canMarkAppointmentNoShow({ status: 'confirmed', startsAt: stamp }, now.getTime()))
          .toBe(canMarkNoShow({ appointment: appointment({ status: 'confirmed', startsAt: stamp }), now }));
      }
    }
    expect(frontend.canMarkAppointmentNoShow({ status: 'cancelled', startsAt: start }, at(60).getTime())).toBe(false);
    expect(frontend.canMarkAppointmentNoShow({ status: 'scheduled', startsAt: start }, at(60).getTime(), 1.5)).toBe(false);
  });
});

// The callable itself needs the Firebase Admin runtime, so its wiring is asserted
// from source: the guards must sit inside the transition transaction before any
// status/event/audit write, and they must use the tested helpers.
describe('transitionAppointment wiring', () => {
  const source = () => readFileSync(new URL('../index.js', import.meta.url), 'utf8');
  const transitionBody = () => {
    const text = source();
    const startIndex = text.indexOf('exports.transitionAppointment');
    return text.slice(startIndex, text.indexOf('exports.cancelPatientAppointment', startIndex));
  };

  it('gates no_show on the shared grace helper and checked_in on today IST', () => {
    const body = transitionBody();
    expect(body).toContain("if (to === 'no_show' && !canMarkNoShow({ appointment, graceMinutes: NO_SHOW_GRACE_MINUTES }))");
    expect(body).toContain("if (to === 'checked_in' && appointment.dateKey !== istDateKey())");
    expect(body).toContain('canTransition(appointment.status, to, role)');
    expect(body.indexOf('canMarkNoShow')).toBeLessThan(body.indexOf('transaction.update'));
    expect(body.indexOf('appointment.dateKey !== istDateKey()')).toBeLessThan(body.indexOf('transaction.update'));
  });

  it('still requires a cancellation reason and denies doctors other appointments', () => {
    const body = transitionBody();
    expect(body).toContain("if (to === 'cancelled' && !cancellationReason)");
    expect(body).toContain("if (role === 'doctor' && appointment.doctorId !== request.auth.token.doctorId)");
  });

  it('both staff queues offer no_show only when the rule allows it', () => {
    for (const page of ['../../Frontend/src/pages/StaffAdmin.jsx', '../../Frontend/src/pages/ManagerWorkspace.jsx']) {
      const text = readFileSync(new URL(page, import.meta.url), 'utf8');
      expect(text).toContain("status !== 'no_show' || canMarkAppointmentNoShow(appointment)");
    }
  });
});
