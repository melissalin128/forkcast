import { useEffect } from 'react';
import {
  BrowserRouter,
  HashRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  useParams,
  useSearchParams,
} from 'react-router-dom';
import { PrefsProvider } from './hooks/usePrefs';
import { ToastProvider } from './hooks/useToast';
import { Account } from './pages/Account';
import { Home } from './pages/Home';
import { Savings } from './pages/Savings';
import { Store } from './pages/Store';

// Static hosts that cannot rewrite deep links to index.html (a shared preview
// page, GitHub Pages) build with VITE_ROUTER=hash so /savings becomes #/savings.
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

/** Search now lives on Home: `/search?q=pizza` becomes `/?q=pizza`. */
function SearchRedirect() {
  const [params] = useSearchParams();
  const q = params.get('q') ?? '';
  return <Navigate to={q ? `/?q=${encodeURIComponent(q)}` : '/'} replace />;
}

export default function App() {
  return (
    <PrefsProvider>
      <ToastProvider>
        <Router>
          <ScrollToTop />
          <div className="app">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/store/:id" element={<Store />} />
              <Route path="/savings" element={<Savings />} />
              <Route path="/account" element={<Account />} />
              <Route path="/prices" element={<Navigate to="/savings" replace />} />
              <Route path="/search" element={<SearchRedirect />} />
              <Route path="/browse" element={<SearchRedirect />} />
              <Route path="/r/:id" element={<LegacyStore />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </div>
        </Router>
      </ToastProvider>
    </PrefsProvider>
  );
}
