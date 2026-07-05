import { useState } from 'react';
import { LandingPage } from './components/landing/LandingPage';
import App from './App';

export default function AppRoot() {
  const [currentView, setCurrentView] = useState<'landing' | 'app'>('landing');

  const handleLaunchApp = () => {
    if (import.meta.env.DEV) {
      // Jika berjalan di komputer lokal (npm run dev), izinkan masuk ke aplikasi
      setCurrentView('app');
    } else {
      // Jika berjalan di Vercel (Production), tampilkan pesan coming soon
      alert("SERA is currently in local development mode. The public application will be available soon!");
    }
  };

  if (currentView === 'landing') {
    return <LandingPage onLaunchApp={handleLaunchApp} />;
  }

  return <App />;
}
