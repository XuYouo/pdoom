import { lazy, Suspense } from 'react';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
const GamePage = lazy(() => import('./pages/GamePage'));

export default function App() {
  return <ErrorBoundary><Suspense fallback={<main className="loading-page"><span className="eyebrow">CLAWD / RUNTIME</span><h1>启动训练终端…</h1><p>Loading the last aligned agent.</p></main>}><GamePage /></Suspense></ErrorBoundary>;
}
