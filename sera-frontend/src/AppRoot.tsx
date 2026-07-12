import { useState, useEffect } from 'react';
import { LandingPage } from './components/landing/LandingPage';
import App from './App';

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

  return <App />;
}
