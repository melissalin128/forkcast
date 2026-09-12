import { useEffect, useRef } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { usePrefs } from '../hooks/usePrefs';
import { zipLabel } from '../lib/prefs';
import { ChevronDown, ChevronLeft, ClearIcon, ForkIcon, PinIcon, SearchIcon } from './Icons';

interface SearchProps {
  value: string;
  onChange: (v: string) => void;
  /** Called on Enter; Home uses it to jump to /search. */
  onSubmit?: (v: string) => void;
  autoFocus?: boolean;
}

interface Props {
  /** Deliver-to row + 48px search field (Home, Search). */
  search?: SearchProps;
  /** Back chevron + title instead of the deliver row (Store). */
  back?: { title: string };
  /** Plain title row (Prices, Account). */
  title?: string;
}

const NAV = [
  { to: '/', label: 'Home', end: true },
  { to: '/search', label: 'Search' },
  { to: '/prices', label: 'Prices' },
  { to: '/account', label: 'Account' },
];

/** Sticky header. Desktop (>640px) gets inline nav links instead of the bottom tab bar. */
export function TopBar({ search, back, title }: Props) {
  const { prefs } = usePrefs();
  const nav = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (search?.autoFocus) inputRef.current?.focus();
  }, [search?.autoFocus]);

  return (
    <header className="top">
      <div className="top__row">
        {back ? (
          <button type="button" className="top__back" onClick={() => (window.history.length > 1 ? nav(-1) : nav('/'))} aria-label="Back">
            <ChevronLeft />
          </button>
        ) : title ? null : (
          <Link to="/account" className="deliver" aria-label={`Deliver to ${prefs.zip}, change in Account`}>
            <PinIcon stroke="var(--accent)" />
            <span className="deliver__label">Deliver to</span>
            <span className="deliver__where">
              <span className="mono">{prefs.zip}</span> · {zipLabel(prefs.zip)}
            </span>
            <ChevronDown stroke="var(--muted)" />
          </Link>
        )}
        {back && <span className="top__title">{back.title}</span>}
        {title && !back && <span className="top__title top__title--page">{title}</span>}
        <span className="grow" />
        <nav className="top__nav" aria-label="Primary">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => (isActive ? 'is-active' : '')}>
              {n.label}
            </NavLink>
          ))}
        </nav>
        <Link to="/" className="brand" aria-label="Forkcast home">
          <ForkIcon size={18} stroke="var(--accent)" />
          <span>Forkcast</span>
        </Link>
      </div>

      {search && (
        <form
          className="searchbar"
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            search.onSubmit?.(search.value);
          }}
        >
          <SearchIcon stroke="var(--muted)" />
          <input
            ref={inputRef}
            type="search"
            value={search.value}
            onChange={(e) => search.onChange(e.target.value)}
            placeholder="Search restaurants or dishes"
            aria-label="Search restaurants or dishes"
            autoComplete="off"
            enterKeyHint="search"
          />
          {search.value && (
            <button type="button" className="searchbar__clear" onClick={() => search.onChange('')} aria-label="Clear search">
              <ClearIcon />
            </button>
          )}
        </form>
      )}
    </header>
  );
}
