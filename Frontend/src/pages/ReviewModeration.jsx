import StaffLayout from '../components/StaffLayout';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStaffAccess } from '../lib/staffSessionContext';
import ReviewStars from '../components/ReviewStars';
import { moderateReview, moderationDetail, moderationQueue } from '../services/reviewService';
import './reviews.css';
const filters = [['pending', 'Awaiting review'], ['published', 'Published'], ['reported', 'Reported'], ['featured', 'Highlights'], ['unpublished', 'Hidden'], ['rejected', 'Rejected'], ['withdrawn', 'Withdrawn']];
const date = value => value ? new Date(value).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : '—';
const ReviewModeration = () => {
  const { role, state } = useStaffAccess(); const permitted = ['admin', 'manager', 'receptionist'].includes(role);
  const home = role === 'admin' ? '/staff/admin' : role === 'manager' ? '/staff/manager' : '/staff/reviews';
  const [status, setStatus] = useState('pending'); const [rows, setRows] = useState([]); const [cursor, setCursor] = useState(null); const [next, setNext] = useState(null);
  const [loading, setLoading] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const [selected, setSelected] = useState(null); const [details, setDetails] = useState(null); const [detailError, setDetailError] = useState('');
  const [reply, setReply] = useState(''); const [redaction, setRedaction] = useState(''); const [reason, setReason] = useState(''); const [rank, setRank] = useState(1);
  const [search, setSearch] = useState(''); const [checked, setChecked] = useState([]); const [batch, setBatch] = useState(''); const generation = useRef(0); const detailGeneration = useRef(0);
  const load = useCallback(async (after = null) => {
    const current = ++generation.current; setLoading(true); setError(''); setSelected(null); setChecked([]); detailGeneration.current += 1;
    try { const result = await moderationQueue({ status, ...(after ? { cursor: after } : {}) }); if (current === generation.current) { setRows(result.feedback); setCursor(after); setNext(result.nextCursor); } }
    catch (caught) { if (current === generation.current) { setRows([]); setError(caught.message || 'Reviews could not be loaded.'); } }
    finally { if (current === generation.current) setLoading(false); }
  }, [status]);
  useEffect(() => { if (state === 'allowed' && permitted) load(); return () => { generation.current += 1; }; }, [state, permitted, load]);
  const open = async row => {
    const current = ++detailGeneration.current; setSelected(row); setDetails(null); setDetailError(''); setReply(row.reply?.text || ''); setRedaction(row.publicComment ?? row.comment); setReason(''); setRank(row.featuredRank || 1);
    try { const result = await moderationDetail({ feedbackId: row.id }); if (current === detailGeneration.current) setDetails(result); }
    catch (caught) { if (current === detailGeneration.current) setDetailError(caught.message || 'Reports and history could not be loaded.'); }
  };
  const update = async (action, extra = {}) => {
    if (busy || !selected) return; setBusy(true); setNotice(''); setError('');
    try { const result = await moderateReview({ feedbackId: selected.id, version: selected.version, action, ...extra }); setNotice(result.message); await load(cursor); }
    catch (caught) { setError(caught.message || 'The update could not be confirmed. Refresh before retrying.'); } finally { setBusy(false); }
  };
  const applyBatch = async () => {
    if (!batch || busy) return; setBusy(true); setError(''); const failures = []; let success = 0;
    for (const row of rows.filter(row => checked.includes(row.id))) {
      try { await moderateReview({ feedbackId: row.id, version: row.version, action: batch, ...(['reject', 'unpublish'].includes(batch) ? { reason } : {}) }); success += 1; }
      catch (caught) { failures.push(`${row.id}: ${caught.message}`); }
    }
    setNotice(`${success} review(s) updated.${failures.length ? ` ${failures.length} not changed: ${failures.join(' · ')}` : ''}`); setBatch(''); setBusy(false); await load(cursor);
  };
  if (!permitted) return <main className="staff-shell"><section className="workspace-gate"><h1>Review moderation access required</h1><p>Administrators, managers and receptionists can manage reviews.</p><Link to={home}>My workspace</Link></section></main>;
  const visible = rows.filter(row => `${row.comment} ${row.publicComment || ''} ${row.reply?.text || ''}`.toLowerCase().includes(search.toLowerCase()));
  return <StaffLayout>
    <div className="review-moderation"><header className="reviews-section-head"><div><p className="section-kicker">PATIENT EXPERIENCE</p><h1>Reviews & feedback</h1><p>Moderate respectfully. Preserve every rating and original review. Never share clinical information in a public reply.</p></div><button type="button" disabled={busy || loading} onClick={() => load(cursor)}>Refresh</button></header>
      {notice && <p className="reviews-notice" role="status">{notice}</p>}{error && <p className="staff-login__error" role="alert">{error}</p>}
      <nav className="review-tabs" aria-label="Moderation queues">{filters.map(([key, label]) => <button type="button" aria-current={key === status ? 'page' : undefined} key={key} disabled={busy} onClick={() => { setStatus(key); setSearch(''); }}>{label}</button>)}</nav>
      <div className="moderation-layout"><section className="moderation-inbox"><header><h2>{filters.find(([key]) => key === status)?.[1]}</h2><label>Search this page<input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Find words in feedback" /></label><small>{rows.length} reviews on this page</small></header>
        {loading ? <p className="reviews-empty" role="status">Loading reviews…</p> : visible.length ? visible.map(row => <article className={selected?.id === row.id ? 'selected' : ''} key={row.id}><label className="moderation-check"><input type="checkbox" aria-label={`Select review ${row.id}`} disabled={busy || row.status === 'withdrawn'} checked={checked.includes(row.id)} onChange={e => setChecked(current => e.target.checked ? [...current, row.id] : current.filter(id => id !== row.id))} /></label><button type="button" className="moderation-open" disabled={busy} onClick={() => open(row)}><span><ReviewStars rating={row.rating} /><span className="review-status">{row.status}</span></span><p>{row.comment}</p><small>{date(row.createdAt)}{row.reportCount ? ` · ${row.reportCount} report(s)` : ''}{row.featuredRank ? ` · Highlight ${row.featuredRank}` : ''}</small><small>{row.publicConsent ? 'Public sharing permitted' : 'Private feedback · cannot publish'}</small></button></article>) : <p className="reviews-empty">{error ? 'Queue unavailable. Refresh to retry.' : 'No reviews in this view.'}</p>}
        <div className="reviews-pagination"><button disabled={busy || loading || !cursor} type="button" onClick={() => load()}>First page</button><button disabled={busy || loading || !next} type="button" onClick={() => load(next)}>Next page</button></div>
        {checked.length > 0 && <section className="moderation-batch"><h3>{checked.length} selected</h3><label>Batch action<select value={batch} onChange={e => setBatch(e.target.value)}><option value="">Choose action</option><option value="publish">Publish consented reviews</option><option value="unpublish">Hide from public page</option><option value="reject">Reject</option></select></label>{['reject', 'unpublish'].includes(batch) && <label>Reason for this batch<input value={reason} onChange={e => setReason(e.target.value)} minLength={5} maxLength={300} /></label>}<button type="button" disabled={!batch || busy || (['reject', 'unpublish'].includes(batch) && reason.trim().length < 5)} onClick={applyBatch}>{busy ? 'Updating…' : 'Apply selected action'}</button></section>}
      </section><section className="moderation-detail" aria-label="Review details">{!selected ? <div className="reviews-empty"><h2>A thoughtful response starts here.</h2><p>Select a review to inspect the original, reply, manage privacy or choose a highlight.</p></div> : <>
        <header><ReviewStars rating={selected.rating} /><span className="review-status">{selected.status}</span><small>Version {selected.version} · {date(selected.createdAt)}</small></header><h2>Original patient feedback</h2><p className="review-comment">{selected.comment}</p><p>{selected.publicConsent ? 'The patient consented to anonymous public sharing.' : 'Private feedback only. Publication is blocked until the patient opts in.'}</p>
        {selected.publicComment != null && <section className="review-reply"><h3>Public privacy edit</h3><p>{selected.publicComment}</p></section>}
        {selected.moderationReason && <p><strong>Last moderation reason:</strong> {selected.moderationReason}</p>}
        {selected.status !== 'withdrawn' ? <><div className="review-actions"><button className="review-primary" type="button" disabled={busy || !selected.publicConsent || selected.status === 'published'} onClick={() => update('publish')}>Publish</button><button type="button" disabled={busy || !selected.featuredRank} onClick={() => update('unfeature')}>Remove highlight</button></div>
          <section><h3>Highlight on the public page</h3><p>Highlights are labelled as clinic-selected and never change the overall rating.</p><label>Position<select value={rank} onChange={e => setRank(Number(e.target.value))}>{[1, 2, 3, 4, 5, 6].map(n => <option value={n} key={n}>{n}</option>)}</select></label><button type="button" disabled={busy || selected.status !== 'published'} onClick={() => update('feature', { rank })}>Save highlight</button></section>
          <form onSubmit={e => { e.preventDefault(); update('reply', { reply }); }}><h3>Public clinic response</h3><label>Reply<textarea value={reply} onChange={e => setReply(e.target.value)} maxLength={1200} placeholder="Thank the patient or acknowledge their concern. Do not confirm diagnoses or treatment." /></label><small>Leave empty to remove an existing reply.</small><button disabled={busy}>Save reply</button></form>
          <section><h3>Privacy & moderation</h3><label>Reason<input value={reason} onChange={e => setReason(e.target.value)} maxLength={300} placeholder="Required for privacy edits, hiding and rejection" /></label><label>Privacy-edited public text<textarea value={redaction} onChange={e => setRedaction(e.target.value)} minLength={10} maxLength={2000} /></label><small>Remove personal information only. Do not change the patient’s meaning or rating. Privacy edits are disclosed publicly; the original stays in this workspace.</small><div className="review-actions"><button type="button" disabled={busy || reason.trim().length < 5 || redaction.trim().length < 10} onClick={() => update('redact', { reason, comment: redaction })}>Save privacy edit</button><button type="button" disabled={busy || reason.trim().length < 5 || selected.publicComment == null} onClick={() => update('restore', { reason })}>Restore original</button><button type="button" disabled={busy || reason.trim().length < 5} onClick={() => update('unpublish', { reason })}>Hide review</button><button type="button" className="button-danger" disabled={busy || reason.trim().length < 5} onClick={() => update('reject', { reason })}>Reject</button></div></section>
        </> : <p>The patient withdrew this review. Staff cannot republish it.</p>}
        <section><h3>Reports & activity</h3>{detailError ? <p role="alert">{detailError}</p> : !details ? <p role="status">Loading activity…</p> : <>{details.reports.length ? details.reports.map((item, i) => <article className="review-report" key={i}><strong>{item.category} · {date(item.at)}</strong><p>{item.reason}</p></article>) : <p>No reports.</p>}{selected.reportCount > 0 && selected.status !== 'withdrawn' && <button type="button" disabled={busy || reason.trim().length < 5} onClick={() => update('resolve_reports', { reason })}>Resolve reports with reason above</button>}<small>Report history is retained after resolution.</small><ol className="review-history">{details.history.map((item, i) => <li key={i}>{item.action.replaceAll('_', ' ')} · v{item.version} · {date(item.at)}</li>)}</ol></>}</section>
      </>}</section></div>
    </div></StaffLayout>;
};
export default ReviewModeration;
