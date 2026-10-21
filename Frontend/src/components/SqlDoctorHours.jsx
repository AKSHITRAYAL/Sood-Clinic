import { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { getPublicDoctorHours } from '../services/publicScheduleService';
import { istDateKey, weekdayIst } from '../lib/ist';

const today = () => istDateKey();
const timeOf = minutes => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
const KIND_LABELS = {
  weekly: 'Published weekly hours',
  extra: 'Extra hours added for this date',
  replace: 'Hours replaced for this date',
  closed: 'Closed on this date',
};

function DoctorHours({ doctorId: preset, api }) {
  const [doctorId, setDoctorId] = useState(preset || '');
  const [date, setDate] = useState(today);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const alive = useRef(false); const running = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const load = async event => {
    event?.preventDefault();
    if (running.current || !doctorId.trim() || !date) return;
    running.current = true; setBusy(true); setError(''); setResult(null);
    try {
      const page = await api({ doctorId: doctorId.trim(), date, weekday: weekdayIst(date) });
      if (alive.current) setResult(page);
    } catch {
      if (alive.current) setError('Clinic hours are unavailable for that doctor and date. Check the details and retry.');
    } finally { if (alive.current) { running.current = false; setBusy(false); } }
  };
  return <section className="admin-panel"><h1>Doctor clinic hours</h1>
    <p>Published clinic hours in IST, straight from the SQL schedule — weekly windows, or the exception the clinic recorded for that exact date.</p>
    <form onSubmit={load}><fieldset disabled={busy}><legend>Choose a doctor and date</legend>
      <label>Doctor ID<input required autoComplete="off" maxLength={80} value={doctorId} onChange={event => setDoctorId(event.target.value)} /></label>
      <label>Clinic date (IST)<input required type="date" value={date} onChange={event => setDate(event.target.value)} /></label>
      <button type="submit" disabled={busy || !doctorId.trim() || !date}>{busy ? 'Loading…' : 'Show clinic hours'}</button>
    </fieldset></form>
    {error && <p role="alert" className="staff-login__error">{error}</p>}
    {result && <><h2>{result.doctorName} · {result.date}</h2>
      <p role="status">{KIND_LABELS[result.kind]}</p>
      {result.windows.length === 0
        ? <p>{result.kind === 'closed' ? 'The clinic is closed on this date.' : 'No published windows are recorded for this date.'}</p>
        : <div className="admin-table-wrap"><table><caption>Clinic hours (IST)</caption>
          <thead><tr><th scope="col">Opens</th><th scope="col">Closes</th></tr></thead>
          <tbody>{result.windows.map(window => <tr key={`${window.startMinute}-${window.endMinute}`}>
            <td>{timeOf(window.startMinute)}</td><td>{timeOf(window.endMinute)}</td>
          </tr>)}</tbody></table></div>}</>}
    <p>Published hours only: appointments, patient details and private schedule notes are never part of this view.</p>
  </section>;
}
DoctorHours.propTypes = { doctorId: PropTypes.string, api: PropTypes.object };

// Staged for the coordinated SQL cutover; do not register in any router before release.
export default function SqlPublicDoctorHours({ doctorId, api = getPublicDoctorHours }) {
  return <DoctorHours key={doctorId || ''} doctorId={doctorId} api={api} />;
}
SqlPublicDoctorHours.propTypes = { doctorId: PropTypes.string, api: PropTypes.object };
