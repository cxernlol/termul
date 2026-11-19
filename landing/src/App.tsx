import { Outlet } from 'react-router';

import { DownloadProvider } from './components/download/DownloadContext';
import { Footer } from './components/layout/Footer';
import { Header } from './components/layout/Header';

export function App() {
  return (
    <DownloadProvider>
      <div className="flex min-h-dvh flex-col">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100] focus:rounded-lg focus:bg-foreground focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-background"
        >
          Skip to content
        </a>
        <Header />
        <div className="flex-1">
          <Outlet />
        </div>
        <Footer />
      </div>
    </DownloadProvider>
  );
}
