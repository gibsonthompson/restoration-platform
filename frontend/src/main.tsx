import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import { AuthProvider } from './context/AuthContext';
import { OrgProvider } from './context/OrgContext';
import App from './App';
import './index.css';

// Register the service worker and actually force the open app to update. With
// autoUpdate alone an open tab keeps serving the old cached shell; here we poll
// for a new sw.js (cache: 'no-store' so we bypass any CDN cache) and reload when
// a new build has taken control, so field techs always get the latest version.
const updateSW = registerSW({
  immediate: true,
  onRegisteredSW(swUrl, r) {
    if (!r) return;
    const check = async () => {
      if (r.installing || !navigator.onLine) return;
      try {
        const resp = await fetch(swUrl, { cache: 'no-store' });
        if (resp?.status === 200) await r.update();
      } catch { /* offline; ignore */ }
    };
    setInterval(check, 60 * 1000);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
  }
});
// Belt-and-suspenders: when a new SW takes control, reload once to show it.
if ('serviceWorker' in navigator) {
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded) return; reloaded = true; window.location.reload();
  });
}
void updateSW;

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