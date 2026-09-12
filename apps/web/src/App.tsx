import { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Browse } from './pages/Browse';
import { Compare } from './pages/Compare';
import { Landing } from './pages/Landing';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [pathname]);
  return null;
}

export default function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/browse" element={<Browse />} />
        <Route path="/r/:id" element={<Compare />} />
        {/* Tabs that are designed but not built in v1 land on Search. */}
        <Route path="*" element={<Navigate to="/browse" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
