import { lazy, Suspense } from 'react';

// The app shell brings in the wallet SDK and real-time client.
const App = lazy(() => import('./App'));

export default function AppRoot() {
  return (
    <Suspense fallback={<div aria-label="Loading Sera" />}>
      <App />
    </Suspense>
  );
}
