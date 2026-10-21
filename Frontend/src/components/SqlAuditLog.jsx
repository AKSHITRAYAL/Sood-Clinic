import { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { sqlAuditLogService } from '../services/sqlAuditLogService';

const stamp = value => new Date(value).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

function AuditLog({ api }) {
  const [events, setEvents] = useState(null);
  const [cursor, setCursor] = useState(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const alive = useRef(false); const running = useRef(false);
  const positions = useRef(new Set()); const seen = useRef(new Set());
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const load = async more => {
    if (running.current || (more && !cursor)) return;
    const position = more ? cursor : null; const key = JSON.stringify(position);
    // Only paging can repeat a window; a fresh load clears the visited set below,
    // so guarding the first page here would make "Refresh from the start" dead.
    if (more && positions.current.has(key)) { setError('That activity page was already requested. Refresh from the start.'); return; }
    running.current = true; setBusy(true); setError('');
    if (!more) { setEvents(null); setCursor(null); positions.current.clear(); seen.current.clear(); }
    try {
      const page = await api.list(position);
      if (!alive.current) return;
      positions.current.add(key);
      const fresh = page.events.filter(row => !seen.current.has(row.id));
      fresh.forEach(row => seen.current.add(row.id));
      setEvents(previous => [...(previous || []), ...fresh]);
      setCursor(page.nextCursor);
    } catch {
      if (alive.current) setError('Activity is unavailable. Verify current administrator access, then retry.');
    } finally { if (alive.current) { running.current = false; setBusy(false); } }
  };
  return <section className="admin-panel"><h1>Activity</h1>
    <p>SQL activity view, newest first, times in IST. Read-only — each view is itself recorded as an audit event.</p>
    <button type="button" disabled={busy} onClick={() => load(false)}>{busy ? 'Loading…' : events ? 'Refresh from the start' : 'Load activity'}</button>
    {error && <p role="alert" className="staff-login__error">{error}</p>}
    {events && (!events.length ? <p>No activity is recorded yet.</p>
      : <div className="admin-table-wrap"><table><caption>Recorded activity (IST)</caption>
        <thead><tr><th scope="col">When</th><th scope="col">Action</th><th scope="col">Actor</th><th scope="col">Resource</th></tr></thead>
        <tbody>{events.map(row => <tr key={row.id}>
          <td>{stamp(row.at)}</td><td>{row.action.replaceAll('_', ' ')}</td>
          <td>{row.actorRole}{row.actorUid ? <><br /><small>{row.actorUid.slice(0, 8)}</small></> : null}</td>
          <td>{row.resourceType}<br /><small>{row.resourceId}</small></td>
        </tr>)}</tbody></table></div>)}
    {cursor && <button type="button" disabled={busy} onClick={() => load(true)}>Load older activity</button>}
    <p>Free-form audit metadata, patient identifiers, contact details, search terms and clinical text are not included.</p>
  </section>;
}
AuditLog.propTypes = { api: PropTypes.object.isRequired };

// Staged only; do not mount into staff routes before the coordinated release.
export default function SqlAuditLog({ accountUid, role, api = sqlAuditLogService }) {
  if (!accountUid || role !== 'admin') return <p role="alert">Current administrator access is required.</p>;
  return <AuditLog key={accountUid} api={api} />;
}
SqlAuditLog.propTypes = { accountUid: PropTypes.string.isRequired, role: PropTypes.string.isRequired, api: PropTypes.object };
