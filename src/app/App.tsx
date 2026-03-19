import { useEffect, useState } from 'react';
import { RouterProvider } from 'react-router';
import { Toaster } from 'sonner';
import { router } from './routes';
import { initUpdater } from './services/updater';
import CriticalUpdateScreen from './components/CriticalUpdateScreen';

export default function App() {
  const [criticalUpdate, setCriticalUpdate] = useState(false);

  useEffect(() => {
    initUpdater({ onCriticalUpdate: () => setCriticalUpdate(true) });
  }, []);

  if (criticalUpdate) return <CriticalUpdateScreen />;

  return (
    <div className="dark min-h-screen bg-[#1a1a2e]">
      <RouterProvider router={router} />
      <Toaster
        theme="dark"
        position="top-center"
        toastOptions={{
          style: {
            background: '#16213e',
            border: '1px solid rgba(255,255,255,0.05)',
            color: '#fff',
          },
        }}
      />
    </div>
  );
}
