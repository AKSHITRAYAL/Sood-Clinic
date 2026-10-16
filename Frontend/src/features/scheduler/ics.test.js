import { describe, expect, it } from 'vitest';
import { appointmentIcs } from './ics';

describe('appointment ICS export', () => {
  it('creates an RFC-style calendar event with escaped fields', () => {
    const result = appointmentIcs({
      reference: 'SC-ABC12345',
      title: 'Consultation, Dr. Sood',
      startsAt: '2026-10-15T11:30:00+05:30',
      endsAt: '2026-10-15T11:50:00+05:30',
    });
    expect(result).toContain('BEGIN:VCALENDAR');
    expect(result).toContain('SUMMARY:Consultation\\, Dr. Sood');
    expect(result).toContain('DTSTART:20261015T060000Z');
    expect(result).toContain('END:VCALENDAR');
  });
});
