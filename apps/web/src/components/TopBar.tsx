import { useEffect, useRef } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { usePrefs } from '../hooks/usePrefs';
import { zipLabel } from '../lib/prefs';
import { ChevronLeft, ClearIcon, ForkIcon, PinIcon, SearchIcon } from './Icons';

interface SearchProps {
  value: string;
  onChange: (v: string) => void;
  autoFocus?: boolean;
}

interface Props {
  /** Deliver-to segment + search segment, combined into one pill (Home). */
  search?: SearchProps;
  /** Back chevron + title instead of the search pill (Store). */
  back?: { title: string };
  /** Plain title row (Savings, Account). */
  title?: string;
}

const NAV = [
  { to: '/', label: 'Home', end: true },
  { to: '/savings', label: 'Savings' },
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
        ) : (
          <Link to="/" className="brand" aria-label="Forkcast home">
            <ForkIcon size={20} stroke="var(--rausch)" />
            <span>Forkcast</span>
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
      </div>

      {search && (
        <form
          className="searchpill"
          role="search"
          onSubmit={(e) => {
            // Results filter as you type; Enter only dismisses the keyboard.
            e.preventDefault();
            inputRef.current?.blur();
          }}
        >
          <Link to="/account" className="searchpill__seg searchpill__seg--where" aria-label={`Deliver to ${prefs.zip}, change in Account`}>
            <PinIcon size={15} stroke="var(--hof)" />
            <span className="searchpill__where">
              <span className="num">{prefs.zip}</span> · {zipLabel(prefs.zip)}
            </span>
          </Link>
          <span className="searchpill__divider" aria-hidden="true" />
          <span className="searchpill__seg searchpill__seg--what">
            <SearchIcon size={16} stroke="var(--muted)" />
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
              <button type="button" className="searchpill__clear" onClick={() => search.onChange('')} aria-label="Clear search">
                <ClearIcon size={15} />
              </button>
            )}
          </span>
        </form>
      )}
    </header>
  );
}
