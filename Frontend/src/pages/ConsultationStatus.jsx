import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import {
  cancelConsultationRequest,
  getConsultationRequestStatus,
  respondToAppointmentProposal,
} from '../services/consultationRequestService';

const STATUS_TEXT = {
  pending: 'Awaiting clinic review',
  proposal_pending: 'The clinic has proposed a time',
  confirmed: 'Confirmed',
  declined: 'Not accepted',
  cancelled: 'Cancelled',
  expired: 'Expired',
};
const formatSlot = (dateKey, time) => new Date(`${dateKey}T${time}:00+05:30`).toLocaleString('en-IN', {
  timeZone: 'Asia/Kolkata', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
});
const friendly = (error) => error?.message || 'This consultation link could not be loaded. Please contact the clinic.';

const ConsultationStatus = () => {
  const [params] = useSearchParams();
  const reference = params.get('reference') || '';
  const token = params.get('token') || '';
  const [status, setStatus] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState('');
  const [showCancel, setShowCancel] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      const { data } = await getConsultationRequestStatus({ reference, token });
      setStatus(data);
    } catch (caught) {
      setError(friendly(caught));
    }
  }, [reference, token]);

  useEffect(() => { if (reference && token) load(); }, [load, reference, token]);

  const act = async (action) => {
    setBusy(true);
    setMessage('');
    setError('');
    try {
      const text = await action();
      setMessage(text);
      await load();
    } catch (caught) {
      setError(friendly(caught));
      await load().catch(() => {});
    } finally {
      setBusy(false);
    }
  };

  const answer = (proposal, accept) => act(async () => {
    await respondToAppointmentProposal({ proposalId: proposal.proposalId, token, accept, reason: accept ? undefined : 'Declined by patient' });
    return accept ? 'Your appointment is confirmed. The clinic will contact you with any further details.' : 'That proposed time was declined. The clinic can offer another time.';
  });

  const cancel = () => act(async () => {
    await cancelConsultationRequest({ reference, token, reason: reason.trim() || 'Cancelled by patient' });
    setShowCancel(false);
    setReason('');
    return 'This consultation was cancelled.';
  });

  if (!reference || !token) {
    return <><Navbar /><main className="booking-page"><section className="booking-page__intro"><p>SOOD CLINIC · PANCHKULA</p><h1>Consultation status</h1><span>Open the secure link the clinic sent you. It includes the reference and access token for one request.</span></section></main><Footer /></>;
  }

  return <><Navbar /><main className="booking-page"><section className="booking-page__intro"><p>SOOD CLINIC · PANCHKULA</p><h1>Your consultation</h1><span>{reference}</span></section><section className="booking-card appointment-booking">{error && <p className="booking-message" role="alert">{error}</p>}{!status && !error && <p className="slot-empty">Loading your consultation…</p>}{status && <div className="booking-form"><div className="booking-form__full"><label>Status</label><strong>{STATUS_TEXT[status.status] || status.status}</strong>{status.declineReason && <small className="booking-field-hint">{status.declineReason}</small>}</div><div className="booking-form__full"><label>Requested service</label><strong>{status.service?.label}</strong>{status.location && <small className="booking-field-hint">{status.location.name} · {status.location.address}</small>}{status.mode === 'video' && <small className="booking-field-hint">Online video consultation. The clinic will share secure joining details after confirmation.</small>}</div>{status.requested && <div className="booking-form__full"><label>Requested time</label><strong>{formatSlot(status.requested.dateKey, status.requested.time)}</strong><small className="booking-field-hint">The clinic reviews availability before confirming.</small></div>}{status.appointment && <div className="booking-form__full"><label>Confirmed appointment</label><strong>{formatSlot(status.appointment.dateKey, new Date(status.appointment.startsAt).toLocaleTimeString('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' }))}</strong><small className="booking-field-hint">Reference {status.appointment.reference}</small></div>}{status.proposals?.length > 0 && <div className="booking-form__full"><label>Proposed times</label>{status.proposals.map((proposal) => <div key={proposal.proposalId} className="booking-selection"><strong>{formatSlot(proposal.dateKey, proposal.time)}</strong><span>{proposal.expiresAt ? `Held until ${new Date(proposal.expiresAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}` : 'Awaiting your response'}</span><div><button type="button" disabled={busy} onClick={() => answer(proposal, true)}>Accept this time</button><button type="button" className="button-danger" disabled={busy} onClick={() => answer(proposal, false)}>Decline</button></div></div>)}</div>}{message && <p className="booking-message" role="status">{message}</p>}{(status.status === 'pending' || status.status === 'proposal_pending' || status.appointment?.canCancel) && !showCancel && <div className="text-center"><button type="button" className="button-danger" onClick={() => setShowCancel(true)}>Cancel this consultation</button></div>}{showCancel && <div className="booking-form__full"><label htmlFor="cancel-reason">Cancellation note <em>Optional</em></label><input id="cancel-reason" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Tell the clinic why you are cancelling" /><div className="text-center"><button type="button" className="button-danger" disabled={busy} onClick={cancel}>Confirm cancellation</button><button type="button" disabled={busy} onClick={() => setShowCancel(false)}>Keep my consultation</button></div></div>}</div>}</section></main><Footer /></>;
};

export default ConsultationStatus;
