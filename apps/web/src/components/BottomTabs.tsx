import { NavLink } from 'react-router-dom';
import { HomeIcon, PricesIcon, SearchIcon, UserIcon } from './Icons';

const TABS = [
  { to: '/', label: 'Home', Icon: HomeIcon, end: true },
  { to: '/search', label: 'Search', Icon: SearchIcon, end: false },
  { to: '/prices', label: 'Prices', Icon: PricesIcon, end: false },
  { to: '/account', label: 'Account', Icon: UserIcon, end: false },
];

/** Bottom tab bar, shown at ≤640px on every screen. */
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
