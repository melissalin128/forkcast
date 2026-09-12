import { NavLink } from 'react-router-dom';
import { AlertIcon, HistoryIcon, SearchIcon, UserIcon } from './Icons';

const TABS = [
  { to: '/browse', label: 'Search', Icon: SearchIcon },
  { to: '/history', label: 'History', Icon: HistoryIcon },
  { to: '/alerts', label: 'Alerts', Icon: AlertIcon },
  { to: '/you', label: 'You', Icon: UserIcon },
];

/** Phone-only bottom navigation. Only Search is wired in v1. */
export function BottomTabs() {
  return (
    <nav className="tabbar" aria-label="Primary">
      {TABS.map(({ to, label, Icon }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) => `tabbar__item${isActive ? ' tabbar__item--active' : ''}`}
          onClick={(e) => {
            if (to !== '/browse') e.preventDefault();
          }}
          aria-disabled={to !== '/browse'}
        >
          <Icon size={22} />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
