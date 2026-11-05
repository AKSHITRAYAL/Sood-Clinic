import { useMemo, useState } from 'react';
import { useStaffAccess } from '../lib/staffSessionContext';
import StaffLayout from '../components/StaffLayout';
import { istDateKey } from '../lib/ist';
import './staffAppointments.css';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const pad = (value) => String(value).padStart(2, '0');
const dateKey = (year, month, day) => `${year}-${pad(month + 1)}-${pad(day)}`;
const parseDate = (value) => {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
};
const toMinutes = (value) => {
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
};
const toClock = (minutes) => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
const formatClock = (value) => {
  const [hour, minute] = value.split(':').map(Number);
  const suffix = hour >= 12 ? 'PM' : 'AM';
  return `${hour % 12 || 12}:${pad(minute)} ${suffix}`;
};
const formatRange = (start, end) => `${formatClock(start)} to ${formatClock(end)}`;
const makeTimeSlots = (start, end, interval = 15) => {
  const slots = [];
  for (let minute = toMinutes(start); minute < toMinutes(end); minute += interval) {
    slots.push(toClock(minute));
  }
  return slots;
};
const initialSessions = [
  { id: 'morning', label: 'Morning', start: '09:00', end: '12:00', icon: 'sunrise' },
  { id: 'evening', label: 'Evening', start: '17:00', end: '21:00', icon: 'sunset' },
];

/**
 * Staff-side visual recreation of the supplied appointments reference.
 *
 * This is deliberately a UI prototype: slot edits, walk-ins and wait-list entries
 * live only in component state. The current project does not expose a staff
 * walk-in creation or unassigned-wait-list callable. Connect those actions to
 * reviewed server endpoints before using this screen for real clinic operations.
 */
export default function StaffAppointments() {
  const { role } = useStaffAccess();
  const today = useMemo(() => istDateKey(), []);
  const [activeTab, setActiveTab] = useState('appointments');
  const [selectedDoctor, setSelectedDoctor] = useState('Dr. A. K. Sood');
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const [year, month] = today.split('-').map(Number);
    return { year, month: month - 1 };
  });
  const [selectedDate, setSelectedDate] = useState(today);
  const [selectedSlot, setSelectedSlot] = useState('10:00');
  const [sessions, setSessions] = useState(initialSessions);
  const [interval, setInterval] = useState(15);
  const [showSettings, setShowSettings] = useState(false);
  const [modal, setModal] = useState('');
  const [notice, setNotice] = useState('');
  const [waitList, setWaitList] = useState([]);
  const [walkIns, setWalkIns] = useState([]);
  const [slotForm, setSlotForm] = useState({ label: 'Additional hours', start: '13:00', end: '14:00' });
  const [waitForm, setWaitForm] = useState({ name: '', phone: '', preference: 'Any available time' });
  const [walkForm, setWalkForm] = useState({ name: '', phone: '', email: '', reason: '' });

  const cells = useMemo(() => {
    const { year, month } = calendarMonth;
    const firstWeekday = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    return [
      ...Array.from({ length: firstWeekday }, (_, index) => ({ key: `blank-${index}`, day: null })),
      ...Array.from({ length: daysInMonth }, (_, index) => ({ key: dateKey(year, month, index + 1), day: index + 1 })),
    ];
  }, [calendarMonth]);

  const slotGroups = useMemo(() => sessions.map((session) => ({
    ...session,
    slots: makeTimeSlots(session.start, session.end, interval),
  })), [sessions, interval]);

  const shiftMonth = (amount) => setCalendarMonth((current) => {
    const next = new Date(current.year, current.month + amount, 1);
    return { year: next.getFullYear(), month: next.getMonth() };
  });

  const addSession = (event) => {
    event.preventDefault();
    const start = toMinutes(slotForm.start);
    const end = toMinutes(slotForm.end);
    if (!slotForm.label.trim() || !Number.isFinite(start) || !Number.isFinite(end) || start >= end) {
      setNotice('Enter a valid session name and an end time later than its start time.');
      return;
    }
    if (sessions.some((item) => start < toMinutes(item.end) && end > toMinutes(item.start))) {
      setNotice('This session overlaps an existing session. Choose a different time range.');
      return;
    }
    setSessions((current) => [...current, {
      id: `session-${Date.now()}`,
      label: slotForm.label.trim(),
      start: slotForm.start,
      end: slotForm.end,
      icon: 'clock',
    }].sort((a, b) => toMinutes(a.start) - toMinutes(b.start)));
    setSelectedSlot(null);
    setModal('');
    setNotice('Session added to this preview. It has not been saved to the clinic schedule.');
  };

  const addWaitListEntry = (event) => {
    event.preventDefault();
    if (!waitForm.name.trim() || !waitForm.phone.trim()) return;
    setWaitList((current) => [...current, { ...waitForm, id: Date.now() }]);
    setWaitForm({ name: '', phone: '', preference: 'Any available time' });
    setModal('');
    setNotice('Wait-list entry added to this preview only. No clinic record was created.');
  };

  const addWalkIn = (event) => {
    event.preventDefault();
    if (!walkForm.name.trim() || !walkForm.phone.trim()) return;
    setWalkIns((current) => [...current, { ...walkForm, id: Date.now(), time: selectedSlot }]);
    setWalkForm({ name: '', phone: '', email: '', reason: '' });
    setNotice('Walk-in added to this preview only. No appointment was booked.');
  };

  const selectedDateLabel = parseDate(selectedDate).toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  return (
    <StaffLayout>
      <div className="staff-appointments">
        <header className="staff-appointments__toolbar">
          <div className="staff-appointments__clinician">
            <div className="staff-appointments__avatar" aria-hidden="true">{selectedDoctor.split(' ').map((part) => part[0]).slice(0, 2).join('')}</div>
            <label>
              <span>CLINICIAN</span>
              <select value={selectedDoctor} onChange={(event) => setSelectedDoctor(event.target.value)} aria-label="Select clinician">
                <option>Dr. A. K. Sood</option>
              </select>
              <small>Sood Clinic</small>
            </label>
          </div>
          <div className="staff-appointments__toolbar-actions">
            <div className="staff-appointments__tabs" role="tablist" aria-label="Appointment workspace">
              <button type="button" role="tab" aria-selected={activeTab === 'appointments'} className={activeTab === 'appointments' ? 'is-active' : ''} onClick={() => setActiveTab('appointments')}>Appointments</button>
              <button type="button" role="tab" aria-selected={activeTab === 'walkin'} className={activeTab === 'walkin' ? 'is-active' : ''} onClick={() => setActiveTab('walkin')}>Walk-In</button>
            </div>
            <div className="staff-appointments__settings-wrap">
              <button type="button" className="staff-appointments__settings" aria-label="Appointment display settings" aria-expanded={showSettings} onClick={() => setShowSettings((value) => !value)}>⚙</button>
              {showSettings && <div className="staff-appointments__settings-menu">
                <label>Slot interval<select value={interval} onChange={(event) => setInterval(Number(event.target.value))}><option value={15}>15 minutes</option></select></label>
                <small>Preview setting only</small>
              </div>}
            </div>
          </div>
        </header>

        <div className="staff-appointments__titlebar">
          <h1>{activeTab === 'appointments' ? 'Appointments' : 'Walk-in registration'}</h1>
          <div className="staff-appointments__breadcrumb"><span>Home</span><b>›</b><strong>{activeTab === 'appointments' ? 'Appointments' : 'Walk-In'}</strong></div>
          <span className="staff-appointments__role">{role || 'Staff'} workspace</span>
        </div>

        {notice && <div className="staff-appointments__notice" role="status">{notice}<button type="button" aria-label="Dismiss message" onClick={() => setNotice('')}>×</button></div>}

        {activeTab === 'appointments' ? (
          <div className="staff-appointments__content">
            <aside className="staff-appointments__calendar">
              <div className="staff-appointments__month-head">
                <button type="button" aria-label="Previous month" onClick={() => shiftMonth(-1)}>‹</button>
                <strong>{MONTHS[calendarMonth.month].slice(0, 3).toUpperCase()} {calendarMonth.year}</strong>
                <button type="button" aria-label="Next month" onClick={() => shiftMonth(1)}>›</button>
              </div>
              <div className="staff-appointments__weekdays">{WEEKDAYS.map((day, index) => <span key={`${day}-${index}`}>{day}</span>)}</div>
              <div className="staff-appointments__days">
                {cells.map((cell) => {
                  if (!cell.day) return <span key={cell.key} />;
                  const value = cell.key;
                  const isSelected = value === selectedDate;
                  const isToday = value === today;
                  return <button key={value} type="button" className={`${isSelected ? 'is-selected' : ''} ${isToday ? 'is-today' : ''}`} onClick={() => { setSelectedDate(value); setSelectedSlot(null); }}>
                    <span>{cell.day}</span>
                    {cell.day % 3 !== 0 && <i aria-hidden="true" />}
                  </button>;
                })}
              </div>
              <div className="staff-appointments__calendar-foot"><span className="staff-appointments__dot" /> Available clinic date</div>
            </aside>

            <section className="staff-appointments__schedule">
              <div className="staff-appointments__schedule-date">
                <div><span>SELECTED DATE</span><strong>{selectedDateLabel}</strong></div>
                <button type="button" onClick={() => { const [year, month] = today.split('-').map(Number); setCalendarMonth({ year, month: month - 1 }); setSelectedDate(today); }}>Today</button>
              </div>
              {slotGroups.map((group) => (
                <section className="staff-appointments__session" key={group.id}>
                  <div className="staff-appointments__session-head">
                    <div className={`staff-appointments__session-icon staff-appointments__session-icon--${group.icon}`} aria-hidden="true">{group.icon === 'sunrise' ? '☀' : group.icon === 'sunset' ? '☼' : '◷'}</div>
                    <div><strong>{group.label}</strong><span>{formatRange(group.start, group.end)}</span></div>
                    <button type="button" className="staff-appointments__add-link" onClick={() => { setSlotForm({ label: 'Additional hours', start: '13:00', end: '14:00' }); setModal('slots'); }}>＋ Add Slots</button>
                  </div>
                  <div className="staff-appointments__slot-grid">
                    {group.slots.map((time) => {
                      const selected = selectedSlot === time;
                      return <button type="button" key={`${group.id}-${time}`} aria-pressed={selected} className={`staff-appointments__slot${selected ? ' is-selected' : ''}`} onClick={() => setSelectedSlot(time)}>
                        <span className="staff-appointments__radio">{selected ? '➜' : ''}</span><span>{formatClock(time)}</span>
                      </button>;
                    })}
                  </div>
                </section>
              ))}

              <section className="staff-appointments__waitlist">
                <div className="staff-appointments__waitlist-title"><span className="staff-appointments__waitlist-icon" aria-hidden="true">◷</span><strong>Waiting list</strong><span className="staff-appointments__wait-count">{waitList.length}</span></div>
                <button type="button" className="staff-appointments__add-link" onClick={() => setModal('waitlist')}>＋ Add to Wait List</button>
                {waitList.length > 0 && <div className="staff-appointments__wait-entries">{waitList.map((entry) => <div key={entry.id}><span><strong>{entry.name}</strong><small>{entry.phone} · {entry.preference}</small></span><button type="button" aria-label={`Remove ${entry.name} from preview wait list`} onClick={() => setWaitList((current) => current.filter((item) => item.id !== entry.id))}>×</button></div>)}</div>}
              </section>
            </section>
          </div>
        ) : (
          <section className="staff-appointments__walkin-card">
            <div className="staff-appointments__walkin-intro"><span className="staff-appointments__walkin-icon">＋</span><div><h2>Register a walk-in patient</h2><p>Capture the visitor&apos;s details and preferred consultation information.</p></div></div>
            <form onSubmit={addWalkIn}>
              <label>Patient name<input value={walkForm.name} onChange={(event) => setWalkForm({ ...walkForm, name: event.target.value })} placeholder="Full name" required /></label>
              <label>Phone number<input type="tel" value={walkForm.phone} onChange={(event) => setWalkForm({ ...walkForm, phone: event.target.value })} placeholder="+91" required /></label>
              <label>Email address <span>Optional</span><input type="email" value={walkForm.email} onChange={(event) => setWalkForm({ ...walkForm, email: event.target.value })} placeholder="name@example.com" /></label>
              <label>Reason for visit<input value={walkForm.reason} onChange={(event) => setWalkForm({ ...walkForm, reason: event.target.value })} placeholder="Optional note" /></label>
              <div className="staff-appointments__walkin-selection"><span>Selected date</span><strong>{selectedDateLabel}</strong><span>Selected time</span><strong>{selectedSlot ? formatClock(selectedSlot) : 'Choose a slot on the Appointments tab'}</strong></div>
              <button className="staff-appointments__primary" type="submit" disabled={!selectedSlot}>Add walk-in to preview</button>
            </form>
            {walkIns.length > 0 && <div className="staff-appointments__walkin-list"><h3>Walk-ins in this preview</h3>{walkIns.map((item) => <div key={item.id}><strong>{item.name}</strong><span>{item.phone} · {formatClock(item.time)}</span></div>)}</div>}
          </section>
        )}
      </div>

      {modal && <div className="staff-appointments__modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setModal(''); }}>
        <section className="staff-appointments__modal" role="dialog" aria-modal="true" aria-labelledby="staff-appointments-modal-title">
          <button type="button" className="staff-appointments__modal-close" aria-label="Close dialog" onClick={() => setModal('')}>×</button>
          {modal === 'slots' && <form onSubmit={addSession}>
            <span className="staff-appointments__eyebrow">SCHEDULE PREVIEW</span><h2 id="staff-appointments-modal-title">Add appointment slots</h2>
            <label>Session name<input value={slotForm.label} onChange={(event) => setSlotForm({ ...slotForm, label: event.target.value })} required /></label>
            <div className="staff-appointments__modal-row"><label>Start time<input type="time" value={slotForm.start} onChange={(event) => setSlotForm({ ...slotForm, start: event.target.value })} required /></label><label>End time<input type="time" value={slotForm.end} onChange={(event) => setSlotForm({ ...slotForm, end: event.target.value })} required /></label></div>
            <p className="staff-appointments__modal-note">This adds a session to the visual preview only. It does not change SQL clinic hours or patient availability.</p>
            <button className="staff-appointments__primary" type="submit">Add slots to preview</button>
          </form>}
          {modal === 'waitlist' && <form onSubmit={addWaitListEntry}>
            <span className="staff-appointments__eyebrow">PATIENT QUEUE</span><h2 id="staff-appointments-modal-title">Add to waiting list</h2>
            <label>Patient name<input value={waitForm.name} onChange={(event) => setWaitForm({ ...waitForm, name: event.target.value })} required /></label>
            <label>Phone number<input type="tel" value={waitForm.phone} onChange={(event) => setWaitForm({ ...waitForm, phone: event.target.value })} required /></label>
            <label>Preferred time<select value={waitForm.preference} onChange={(event) => setWaitForm({ ...waitForm, preference: event.target.value })}><option>Any available time</option><option>Morning</option><option>Evening</option></select></label>
            <p className="staff-appointments__modal-note">This entry is stored only in the current browser view. No clinic wait-list record is created.</p>
            <button className="staff-appointments__primary" type="submit">Add to preview</button>
          </form>}
        </section>
      </div>}
    </StaffLayout>
  );
}
