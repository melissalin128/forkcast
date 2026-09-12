import { Link } from 'react-router-dom';
import { USER_SUBSCRIPTIONS, ZIP } from '../data/mock';
import { ChevronDown, ChevronRight, PinIcon, SearchIcon } from './Icons';
import { Logo } from './Logo';

interface Props {
  /** Browse shows the search field; compare shows a breadcrumb instead. */
  search?: { value: string; onChange: (v: string) => void };
  crumb?: string;
}

export function TopBar({ search, crumb }: Props) {
  const passes = USER_SUBSCRIPTIONS.length;
  return (
    <header className={`topbar ${search ? 'topbar--browse' : 'topbar--compare'}`}>
      <Logo />
      {search ? (
        <>
          <button type="button" className="deliver" aria-label={`Deliver to ${ZIP}`}>
            <PinIcon />
            <span>Deliver to</span>
            <span className="mono">{ZIP}</span>
            <ChevronDown stroke="#a39c92" />
          </button>
          <label className="search">
            <SearchIcon />
            <span className="sr-only">Search restaurants, dishes, cuisines</span>
            <input
              type="search"
              value={search.value}
              onChange={(e) => search.onChange(e.target.value)}
              placeholder="Search restaurants, dishes, cuisines"
              autoComplete="off"
            />
          </label>
        </>
      ) : (
        <nav className="crumb" aria-label="Breadcrumb">
          <Link to="/browse">Cheapest near you</Link>
          <ChevronRight stroke="#a39c92" />
          <span className="crumb__here">{crumb}</span>
        </nav>
      )}
      {!search && <div className="grow" />}
      <span className="pill">
        <span className="dot" style={{ background: 'var(--win)' }} />
        <span>
          {passes} pass{passes === 1 ? '' : 'es'} applied
        </span>
      </span>
    </header>
  );
}
