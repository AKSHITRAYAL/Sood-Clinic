import StaffLayout from '../components/StaffLayout';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  approveConsultationRequest,
  bulkApproveConsultationRequests,
  consultationStatusLink,
  declineConsultationRequest,
  expireConsultationProposals,
  listConsultationRequests,
  offerAppointmentProposal,
} from '../services/consultationRequestService';

const statusLabel = { pending: 'Awaiting review', proposal_pending: 'Time proposed', confirmed: 'Confirmed', declined: 'Declined', cancelled: 'Cancelled' };
const formatRequested = (requested, mode) => requested
  ? `${requested.dateKey} · ${requested.time}`
  : mode === 'video' ? 'Online time to assign' : '—';
const friendly = (error) => error?.code === 'functions/deadline-exceeded'
  ? 'The result could not be confirmed. Refresh the queue before retrying.'
  : error?.message || 'The consultation queue could not be updated.';

const ConsultationRequests = () => {
  const [requests, setRequests] = useState([]);
  const [filter, setFilter] = useState('pending');
  const [selected, setSelected] = useState([]);
  const [assignments, setAssignments] = useState({});
  const [declineReasons, setDeclineReasons] = useState({});
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [cursor, setCursor] = useState(null);
  const [nextCursor, setNextCursor] = useState(null);
  const generation = useRef(0);

  const load = useCallback(async (status = filter, after = null) => {
    const current = ++generation.current;
    setError(''); setLoading(true);
    try {
      const { requests: rows, nextCursor: next } = (await listConsultationRequests({ status, ...(after ? { cursor: after } : {}) })).data;
      if (current !== generation.current) return;
      setRequests(rows);
      setCursor(after); setNextCursor(next ?? null);
      setSelected([]);
      setAssignments(Object.fromEntries(rows.map((row) => [row.requestId, {
        dateKey: row.requested?.dateKey || '',
        time: row.requested?.time || '',
      }])));
    } catch (caught) {
      if (current === generation.current) { setRequests([]); setNextCursor(null); setError(friendly(caught)); }
    } finally { if (current === generation.current) setLoading(false); }
  }, [filter]);

  useEffect(() => { load(filter); return () => { generation.current += 1; }; }, [filter, load]);

  const openRequests = useMemo(() => requests.filter((row) => row.status === 'pending'), [requests]);
  const eligibleForBulk = openRequests.filter((row) => row.mode === 'in_person' || (assignments[row.requestId]?.dateKey && assignments[row.requestId]?.time));

  const run = async (action, message) => {
    if (busy || loading) return;
    setBusy(true);
    setNotice('');
    setError('');
    try {
      const result = await action();
      setNotice(typeof message === 'function' ? message(result) : message);
      await load(filter);
    } catch (caught) {
      setError(friendly(caught));
    } finally {
      setBusy(false);
    }
  };

  const updateAssignment = (requestId, patch) => setAssignments((current) => ({ ...current, [requestId]: { ...current[requestId], ...patch } }));
  const toggle = (requestId) => setSelected((current) => (current.includes(requestId) ? current.filter((id) => id !== requestId) : [...current, requestId]));

  const approve = (row) => run(
    () => approveConsultationRequest({ requestId: row.requestId, ...assignments[row.requestId] }),
    (result) => `Confirmed ${result.data.reference} for ${row.patient.name}.`,
  );
  const propose = (row) => run(
    () => offerAppointmentProposal({ requestId: row.requestId, ...assignments[row.requestId] }),
    (result) => `The proposed time is now held for the patient until it expires. Send them this secure link: ${consultationStatusLink({ reference: row.reference, token: result.data.accessToken })}`,
  );
  const decline = (row) => run(
    () => declineConsultationRequest({ requestId: row.requestId, reason: declineReasons[row.requestId] || '' }),
    'The request was declined and the reason was recorded.',
  );
  const bulk = () => run(
    () => bulkApproveConsultationRequests({
      requestIds: selected,
      assignments: Object.fromEntries(selected.map((id) => [id, assignments[id] || {}])),
    }),
    (result) => {
      const { confirmed, pending = 0, outcomes } = result.data;
      const conflicts = outcomes.filter((outcome) => outcome.status === 'pending').map((outcome) => `${outcome.requestId}: ${outcome.reason}`);
      return `${confirmed} confirmed, ${pending} left pending for manual review.${conflicts.length ? ` Conflicts — ${conflicts.join('; ')}` : ''}`;
    },
  );
  const expire = () => run(() => expireConsultationProposals(25), (result) => `${result.data.expired} expired proposal(s) released.`);

  return <StaffLayout><div className="staff-admin"><header className="staff-admin__heading"><div><p className="section-kicker">Consultation requests</p><h1>Review patient requests</h1><span>Approving checks the shared doctor capacity inside one transaction. Clinical intake is restricted to the treating doctor and administrators. Managers can coordinate video links.</span></div></header>{notice && <p className="admin-notice" role="status">{notice}</p>}{error && <p className="staff-login__error" role="alert">{error}</p>}<section className="admin-panel"><div className="admin-panel__head"><div><p className="section-kicker">Queue</p><h2>{statusLabel[filter] || 'Requests'}</h2></div><div><label>Status<select disabled={busy || loading} value={filter} onChange={(event) => setFilter(event.target.value)}><option value="pending">Awaiting review</option><option value="proposal_pending">Time proposed</option><option value="confirmed">Confirmed</option><option value="declined">Declined</option><option value="all">All</option></select></label><button type="button" disabled={busy || loading} onClick={expire}>Release expired proposals</button></div></div><div className="admin-panel__head"><div><span>{openRequests.length} awaiting review on this page · {eligibleForBulk.length} eligible for batch approval</span></div><button type="button" disabled={busy || loading || !selected.length || selected.length > 20} onClick={bulk}>Approve selected ({selected.length})</button></div><div className="admin-appointment-list">{requests.length ? requests.map((row) => <article className="admin-appointment" key={row.requestId}><div><label><input type="checkbox" checked={selected.includes(row.requestId)} disabled={row.status !== 'pending' || busy || loading} onChange={() => toggle(row.requestId)} /> {row.reference}</label><strong>{row.patient.name}</strong><span>{row.mode === 'video' ? 'Online video' : row.locationId} · {row.serviceLabel} · 15 min</span><small>{formatRequested(row.requested, row.mode)} · {row.patient.phone || row.patient.email}</small><small>{row.intake.restricted ? 'Clinical intake restricted for managers' : row.intake.reason || 'No reason given'}</small></div><div><span className={`appointment-status appointment-status--${row.status}`}>{statusLabel[row.status] || row.status}</span>{row.status === 'pending' && <div className="admin-appointment__actions"><label>Date<input type="date" value={assignments[row.requestId]?.dateKey || ''} onChange={(event) => updateAssignment(row.requestId, { dateKey: event.target.value })} /></label><label>Time<input type="time" step="900" value={assignments[row.requestId]?.time || ''} onChange={(event) => updateAssignment(row.requestId, { time: event.target.value })} /></label><button type="button" disabled={busy || loading} onClick={() => approve(row)}>Approve</button><button type="button" disabled={busy || loading || !assignments[row.requestId]?.dateKey || !assignments[row.requestId]?.time} onClick={() => propose(row)}>Propose time</button><label>Decline reason<input value={declineReasons[row.requestId] || ''} onChange={(event) => setDeclineReasons({ ...declineReasons, [row.requestId]: event.target.value })} placeholder="Required to decline" /></label><button type="button" className="button-danger" disabled={busy || loading || !(declineReasons[row.requestId] || '').trim()} onClick={() => decline(row)}>Decline</button></div>}{row.appointmentId && <small>Appointment {row.appointmentId}</small>}</div></article>) : <p className="empty-state" role="status">{loading ? 'Loading requests…' : error ? 'Requests could not be loaded. Refresh to retry.' : 'No consultation requests in this view.'}</p>}</div><div className="admin-panel__head"><button type="button" disabled={busy || loading || !cursor} onClick={() => load(filter)}>First page</button><button type="button" disabled={busy || loading} onClick={() => load(filter, cursor)}>Refresh</button><button type="button" disabled={busy || loading || !nextCursor} onClick={() => load(filter, nextCursor)}>Next page</button></div></section></div></StaffLayout>;
};

export default ConsultationRequests;
