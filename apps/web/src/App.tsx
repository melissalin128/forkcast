import { useEffect } from 'react';
import { BrowserRouter, HashRouter, Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { PrefsProvider } from './hooks/usePrefs';
import { Account } from './pages/Account';
import { Home } from './pages/Home';
import { Prices } from './pages/Prices';
import { Search } from './pages/Search';
import { Store } from './pages/Store';

// Static hosts that cannot rewrite deep links to index.html (a shared preview
// page, GitHub Pages) build with VITE_ROUTER=hash so /search becomes #/search.
const Router = import.meta.env.VITE_ROUTER === 'hash' ? HashRouter : BrowserRouter;

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [pathname]);
  return null;
}

/** Old `/r/:id` links from the first build land on the store page. */
function LegacyStore() {
  const { id = '' } = useParams();
  return <Navigate to={`/store/${id}`} replace />;
}

export default function App() {
  return (
    <PrefsProvider>
      <Router>
        <ScrollToTop />
        <div className="app">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/search" element={<Search />} />
            <Route path="/store/:id" element={<Store />} />
            <Route path="/prices" element={<Prices />} />
            <Route path="/account" element={<Account />} />
            <Route path="/browse" element={<Navigate to="/search" replace />} />
            <Route path="/r/:id" element={<LegacyStore />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </Router>
    </PrefsProvider>
  );
}
