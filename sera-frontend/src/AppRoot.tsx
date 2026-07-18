import { lazy, Suspense, useState, useEffect } from 'react';
import { LandingPage } from './components/landing/LandingPage';
import seraLogo from './assets/sera-logo.png';
import './LaunchNotice.css';

// The app shell brings in the wallet SDK and real-time client. Keep the public
// landing page fast by downloading those dependencies only after Launch App.
const App = lazy(() => import('./App'));

export default function AppRoot() {
  const [currentView, setCurrentView] = useState<'landing' | 'app'>(() => {
    return (localStorage.getItem("sera_app_root_view") as any) === 'app' ? 'app' : 'landing';
  });
  const [isLaunchNoticeOpen, setIsLaunchNoticeOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem("sera_app_root_view", currentView);
  }, [currentView]);

  const handleLaunchApp = () => {
    if (import.meta.env.DEV) {
      // Jika berjalan di komputer lokal (npm run dev), izinkan masuk ke aplikasi
      setCurrentView('app');
    } else {
      setIsLaunchNoticeOpen(true);
    }
  };

  if (currentView === 'landing') {
    return <>
      <LandingPage onLaunchApp={handleLaunchApp} />
      {isLaunchNoticeOpen && <LaunchNotice onClose={() => setIsLaunchNoticeOpen(false)} />}
    </>;
  }

  return (
    <Suspense fallback={<div aria-label="Loading Sera" />}>
      <App />
    </Suspense>
  );
}

function LaunchNotice({ onClose }: { onClose: () => void }) {
  return <div className="launch-notice-backdrop" role="presentation" onMouseDown={onClose}>
    <section className="launch-notice" role="dialog" aria-modal="true" aria-labelledby="launch-notice-title" onMouseDown={(event) => event.stopPropagation()}>
      <div className="launch-notice-status"><div className="launch-notice-mark"><img src={seraLogo} alt="SERA" /></div><p className="launch-notice-kicker">SERA · CONTROLLED RELEASE</p></div>
      <h1 id="launch-notice-title">Your Operational Partner is preparing for public access.</h1>
      <p>The private application is currently in a controlled release. You can continue exploring SERA through the public Reception, or contact us directly.</p>
      <div className="launch-notice-actions">
        <div className="launch-notice-contacts" aria-label="Contact SERA">
          <a href="https://mail.google.com/mail/?view=cm&fs=1&to=seraos.agent%40gmail.com" target="_blank" rel="noreferrer" aria-label="Email SERA with Gmail" title="Open Gmail"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4.25 18V6.25" stroke="#4285F4" strokeWidth="3.1" strokeLinecap="round" /><path d="m4.25 6.25 7.75 5.8" stroke="#EA4335" strokeWidth="3.1" strokeLinecap="round" strokeLinejoin="round" /><path d="m12 12.05 7.75-5.8" stroke="#FBBC04" strokeWidth="3.1" strokeLinecap="round" strokeLinejoin="round" /><path d="M19.75 6.25V18" stroke="#34A853" strokeWidth="3.1" strokeLinecap="round" /></svg></a>
          <a className="launch-notice-x" href="https://x.com/seraos_agent?t=s86TFhszPI6ETJhYXO_L6A&s=09" target="_blank" rel="noreferrer" aria-label="Follow SERA on X" title="Open X"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18.901 1.153h3.68l-8.042 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932 6.064-6.932Zm-1.29 19.468h2.039L6.486 3.259H4.298L17.61 20.62Z" /></svg></a>
          <a className="launch-notice-telegram" href="https://t.me/Seraos_agent" target="_blank" rel="noreferrer" aria-label="Contact SERA on Telegram" title="Open Telegram"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21.4 3.4a1.45 1.45 0 0 0-1.5-.22L2.95 9.8a1.44 1.44 0 0 0 .12 2.72l4.2 1.32 1.6 5.07a1.42 1.42 0 0 0 2.4.53l2.34-2.35 4.17 3.05a1.44 1.44 0 0 0 2.26-.85l2.18-14.4a1.43 1.43 0 0 0-.82-1.48ZM9.42 13.02l8.24-5.1-6.75 6.53-.26 2.62-1.23-3.9Z" /></svg></a>
        </div>
        <button type="button" onClick={onClose}>Return to Reception</button>
      </div>
    </section>
  </div>;
}
