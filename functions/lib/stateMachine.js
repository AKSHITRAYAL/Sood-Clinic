const ROLE = Object.freeze({ receptionist: 'reception', admin: 'admin', doctor: 'doctor' });

const TRANSITIONS = Object.freeze({
  scheduled: Object.freeze({ confirmed: ['reception', 'admin', 'doctor'], checked_in: ['reception', 'admin'], cancelled: ['reception', 'admin', 'doctor'], no_show: ['reception', 'admin'] }),
  confirmed: Object.freeze({ checked_in: ['reception', 'admin'], cancelled: ['reception', 'admin', 'doctor'], no_show: ['reception', 'admin'] }),
  checked_in: Object.freeze({ in_consultation: ['doctor'], cancelled: ['reception', 'admin'] }),
  in_consultation: Object.freeze({ completed: ['doctor'] }),
});

const canTransition = (from, to, role) => Boolean(TRANSITIONS[from]?.[to]?.includes(role));

module.exports = { ROLE, TRANSITIONS, canTransition };
