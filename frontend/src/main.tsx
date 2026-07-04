import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import { startUpdateWatcher } from './lib/version';
import { AuthProvider } from './context/AuthContext';
import { OrgProvider } from './context/OrgContext';
import App from './App';
import './index.css';

// Service worker handles offline precache. Update detection is handled by the
// version watcher (more reliable on iOS than the SW's own reload behavior).
registerSW({ immediate: true });
startUpdateWatcher();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <OrgProvider>
          <App />
        </OrgProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);