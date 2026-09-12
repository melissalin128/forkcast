import { NavLink } from 'react-router-dom';
import { HomeIcon, SavingsIcon, UserIcon } from './Icons';

const TABS = [
  { to: '/', label: 'Home', Icon: HomeIcon, end: true },
  { to: '/savings', label: 'Savings', Icon: SavingsIcon, end: false },
  { to: '/account', label: 'Account', Icon: UserIcon, end: false },
];

/** Bottom tab bar, shown at ≤640px on Home, Savings and Account. */
export function BottomTabs() {
  return (
    <nav className="tabbar" aria-label="Primary">
      {TABS.map(({ to, label, Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) => `tabbar__item${isActive ? ' tabbar__item--active' : ''}`}
        >
          <Icon size={22} />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
