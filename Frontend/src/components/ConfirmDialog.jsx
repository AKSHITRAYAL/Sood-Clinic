import { useEffect, useId, useRef, useState } from 'react';
import PropTypes from 'prop-types';

const focusableSelector = 'button:not([disabled]), textarea:not([disabled]), [href], input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

const ConfirmDialog = ({ open, title, message, confirmLabel, requireReason, onConfirm, onCancel }) => {
  const dialogRef = useRef(null);
  const openerRef = useRef(null);
  const [reason, setReason] = useState('');
  const titleId = useId();
  const reasonIsValid = !requireReason || reason.trim().length >= 3;

  useEffect(() => {
    if (!open) return undefined;
    openerRef.current = document.activeElement;
    setReason('');
    const focusTimer = window.setTimeout(() => {
      dialogRef.current?.querySelector(requireReason ? 'textarea' : 'button:not([disabled])')?.focus();
    }, 0);
    const onKeyDown = (event) => {
      if (event.key === 'Escape') { event.preventDefault(); onCancel(); return; }
      if (event.key !== 'Tab') return;
      const items = [...(dialogRef.current?.querySelectorAll(focusableSelector) || [])];
      if (!items.length) return;
      const first = items[0]; const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => { window.clearTimeout(focusTimer); document.removeEventListener('keydown', onKeyDown); openerRef.current?.focus?.(); };
  }, [open, requireReason, onCancel]);

  if (!open) return null;
  const submit = () => { if (reasonIsValid) onConfirm(reason.trim()); };
  return <div className="confirm-dialog__backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
    <section className="confirm-dialog" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <h2 id={titleId}>{title}</h2>
      <p>{message}</p>
      {requireReason && <label>Reason<textarea value={reason} onChange={(event) => setReason(event.target.value)} rows="3" aria-describedby={`${titleId}-hint`} /></label>}
      {requireReason && <small id={`${titleId}-hint`}>Enter at least 3 characters to continue.</small>}
      <div className="confirm-dialog__actions"><button type="button" className="staff-secondary-button" onClick={onCancel}>Cancel</button><button type="button" className="button-danger" disabled={!reasonIsValid} onClick={submit}>{confirmLabel}</button></div>
    </section>
  </div>;
};

ConfirmDialog.propTypes = {
  open: PropTypes.bool.isRequired,
  title: PropTypes.string.isRequired,
  message: PropTypes.string.isRequired,
  confirmLabel: PropTypes.string.isRequired,
  requireReason: PropTypes.bool,
  onConfirm: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
};

ConfirmDialog.defaultProps = { requireReason: false };
export default ConfirmDialog;
