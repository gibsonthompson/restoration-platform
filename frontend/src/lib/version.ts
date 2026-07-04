// Reliable PWA update detection for iOS. iOS pins an installed PWA to the version
// it first loaded and a plain reload re-serves the stale memory cache, so we poll
// a no-cache version.json and, on a mismatch, do the "nuclear" update: unregister
// the service worker, clear all caches, and hard-reload with a cache-busting param.
export const APP_VERSION: string = __APP_VERSION__;

async function forceUpdate() {
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch { /* ignore */ }
  const url = new URL(window.location.href);
  url.searchParams.set('v', Date.now().toString());   // defeat the iOS memory cache
  window.location.replace(url.toString());
}

let checking = false;
export async function checkForUpdate() {
  if (checking || (typeof navigator !== 'undefined' && navigator.onLine === false)) return;
  checking = true;
  try {
    const resp = await fetch(`/version.json?_=${Date.now()}`, { cache: 'no-store' });
    if (resp.ok) {
      const data = await resp.json();
      if (data?.version && data.version !== APP_VERSION) { await forceUpdate(); return; }
    }
  } catch { /* offline / not deployed yet — ignore */ } finally { checking = false; }
}

export function startUpdateWatcher() {
  checkForUpdate();
  setInterval(checkForUpdate, 60 * 1000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkForUpdate();
  });
}