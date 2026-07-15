import { lazy, Suspense, useState, useEffect } from 'react';
import { LandingPage } from './components/landing/LandingPage';

// The app shell brings in the wallet SDK and real-time client. Keep the public
// landing page fast by downloading those dependencies only after Launch App.
const App = lazy(() => import('./App'));

export default function AppRoot() {
  const [currentView, setCurrentView] = useState<'landing' | 'app'>(() => {
    return (localStorage.getItem("sera_app_root_view") as any) === 'app' ? 'app' : 'landing';
  });

  useEffect(() => {
    localStorage.setItem("sera_app_root_view", currentView);
  }, [currentView]);

  const handleLaunchApp = () => {
    if (import.meta.env.DEV) {
      // Jika berjalan di komputer lokal (npm run dev), izinkan masuk ke aplikasi
      setCurrentView('app');
    } else {
      // Jika berjalan di Vercel (Production), tampilkan pesan coming soon
      alert("Sera is currently in local development mode. The public application will be available soon!");
    }
  };

  if (currentView === 'landing') {
    return <LandingPage onLaunchApp={handleLaunchApp} />;
  }

  return (
    <Suspense fallback={<div aria-label="Loading Sera" />}>
      <App />
    </Suspense>
  );
}
