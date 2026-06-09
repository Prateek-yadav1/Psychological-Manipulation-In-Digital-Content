import { useEffect, useState } from 'react';
import { RouterProvider } from 'react-router';
import { Toaster } from 'sonner';
import { router } from './routes';
import { AppProvider } from '../context/AppContext';
import { LoadingScreen } from './components/LoadingScreen';

export default function App() {
  const [showStartupLoader, setShowStartupLoader] = useState(true);
  const [readyToShowApp, setReadyToShowApp] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setReadyToShowApp(true), 3000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!readyToShowApp) return;
    setShowStartupLoader(false);
  }, [readyToShowApp]);

  return (
    <AppProvider>
      <LoadingScreen isVisible={showStartupLoader} message="Starting ManipuLens AI runtime..." />
      <RouterProvider router={router} />
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: 'rgba(13, 21, 37, 0.95)',
            border: '1px solid rgba(78, 120, 255, 0.3)',
            color: '#E8F3F1',
            fontFamily: "'IBM Plex Sans', sans-serif",
          },
        }}
      />
    </AppProvider>
  );
}
