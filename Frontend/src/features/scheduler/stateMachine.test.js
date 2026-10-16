import { describe, expect, it } from 'vitest';
import { allowedTransitions } from './stateMachine';

describe('scheduler state machine', () => {
  it('only exposes transitions legal for the viewer role', () => {
    expect(allowedTransitions('scheduled', 'manager')).toEqual(['confirmed', 'checked_in', 'cancelled', 'no_show']);
    expect(allowedTransitions('checked_in', 'doctor')).toEqual(['in_consultation']);
    expect(allowedTransitions('checked_in', 'manager')).toEqual(['cancelled']);
  });

  it('does not expose actions for terminal or unknown states', () => {
    expect(allowedTransitions('completed', 'doctor')).toEqual([]);
    expect(allowedTransitions('missing', 'admin')).toEqual([]);
  });
});
