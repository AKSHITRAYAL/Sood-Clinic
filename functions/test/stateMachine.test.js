import { describe, expect, it } from 'vitest';
import stateMachine from '../lib/stateMachine.js';

const { canTransition } = stateMachine;

describe('appointment state machine', () => {
  it('permits only the staff transitions appropriate to each role', () => {
    expect(canTransition('scheduled', 'confirmed', 'reception')).toBe(true);
    expect(canTransition('scheduled', 'checked_in', 'admin')).toBe(true);
    expect(canTransition('checked_in', 'in_consultation', 'doctor')).toBe(true);
    expect(canTransition('in_consultation', 'completed', 'doctor')).toBe(true);
    expect(canTransition('confirmed', 'cancelled', 'doctor')).toBe(true);
  });

  it('rejects skipped states and privilege escalation', () => {
    expect(canTransition('scheduled', 'completed', 'admin')).toBe(false);
    expect(canTransition('scheduled', 'in_consultation', 'doctor')).toBe(false);
    expect(canTransition('checked_in', 'completed', 'doctor')).toBe(false);
    expect(canTransition('scheduled', 'cancelled', 'patient')).toBe(false);
  });
});
