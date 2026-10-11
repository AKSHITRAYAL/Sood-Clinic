const ROLE = Object.freeze({ manager: 'manager', admin: 'admin', doctor: 'doctor' });

const TRANSITIONS = Object.freeze({
  scheduled: Object.freeze({ confirmed: ['manager', 'admin', 'doctor'], checked_in: ['manager', 'admin'], cancelled: ['manager', 'admin', 'doctor'], no_show: ['manager', 'admin'] }),
  confirmed: Object.freeze({ checked_in: ['manager', 'admin'], cancelled: ['manager', 'admin', 'doctor'], no_show: ['manager', 'admin'] }),
  checked_in: Object.freeze({ in_consultation: ['doctor'], cancelled: ['manager', 'admin'] }),
  in_consultation: Object.freeze({ completed: ['doctor'] }),
});

const canTransition = (from, to, role) => Boolean(TRANSITIONS[from]?.[to]?.includes(role));

module.exports = { ROLE, TRANSITIONS, canTransition };
