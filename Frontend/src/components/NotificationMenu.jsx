import { useState } from 'react';
import PropTypes from 'prop-types';

const NotificationMenu = ({ items = [] }) => {
  const [open, setOpen] = useState(false);
  return <div className="notification-menu"><button type="button" className="notification-menu__trigger" aria-label="Notifications" aria-expanded={open} onClick={() => setOpen((value) => !value)}>🔔{items.length > 0 && <span>{items.length}</span>}</button>{open && <section className="notification-menu__panel" aria-label="Notifications"><strong>Notifications</strong>{items.length ? <ul>{items.map((item) => <li key={item}>{item}</li>)}</ul> : <p>You’re all caught up.</p>}</section>}</div>;
};

NotificationMenu.propTypes = { items: PropTypes.arrayOf(PropTypes.string) };
export default NotificationMenu;
