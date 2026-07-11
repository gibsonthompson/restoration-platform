import { useEffect, useState } from 'react';
import { Share, PlusSquare, Download, Check, MonitorSmartphone, X } from 'lucide-react';

// Add to Home Screen / PWA install.
// Two platforms, two mechanisms:
//  - Android + desktop Chrome/Edge fire 'beforeinstallprompt', which we capture
//    and replay on a button press (the event can only be used once).
//  - iOS Safari has NO install event at all, so the only path is manual
//    instructions: Share, then Add to Home Screen. It must be Safari; other iOS
//    browsers cannot add to the home screen.
// If the app is already installed (running standalone) we render nothing.

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const isIOS = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  // iPadOS 13+ reports as MacIntel; touch points disambiguate it from a real Mac
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as any).standalone === true;

export function useInstallState() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(isStandalone());

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();                       // stop Chrome's own mini-infobar
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => { setInstalled(true); setDeferred(null); };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  async function promptInstall() {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);                          // the event is single-use
  }

  return { canPrompt: !!deferred, promptInstall, ios: isIOS(), installed };
}

// Full card, for the Settings page.
export function InstallCard() {
  const { canPrompt, promptInstall, ios, installed } = useInstallState();

  if (installed) {
    return (
      <div className="card flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
          <Check size={20} />
        </div>
        <div>
          <div className="font-bold text-[15px]">Installed</div>
          <div className="text-[12px] text-gray-500">DocuMate is running from your home screen.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-sky-soft text-sky-deep flex items-center justify-center shrink-0">
          <MonitorSmartphone size={20} />
        </div>
        <div>
          <div className="font-bold text-[15px]">Add DocuMate to your home screen</div>
          <div className="text-[12px] text-gray-500">Opens full screen like an app, and loads faster in the field.</div>
        </div>
      </div>

      {ios ? (
        <ol className="mt-4 space-y-2.5">
          {[
            [<Share key="s" size={15} />, <>Tap the <span className="font-semibold">Share</span> button in Safari's toolbar.</>],
            [<PlusSquare key="p" size={15} />, <>Scroll and choose <span className="font-semibold">Add to Home Screen</span>.</>],
            [<Check key="c" size={15} />, <>Tap <span className="font-semibold">Add</span>. DocuMate appears with your other apps.</>]
          ].map(([icon, text], i) => (
            <li key={i} className="flex items-start gap-2.5 text-[13px] text-gray-600">
              <span className="w-6 h-6 rounded-lg bg-gray-100 text-gray-500 flex items-center justify-center shrink-0 mt-px">{icon}</span>
              <span className="leading-relaxed">{text}</span>
            </li>
          ))}
          <li className="text-[11px] text-gray-400 pt-1">On iPhone and iPad this only works in Safari.</li>
        </ol>
      ) : canPrompt ? (
        <button onClick={promptInstall} className="btn-primary w-full mt-4 py-3">
          <Download size={17} /> Install DocuMate
        </button>
      ) : (
        <p className="text-[12px] text-gray-500 mt-4 leading-relaxed">
          In Chrome, open the browser menu and choose <span className="font-semibold">Install app</span> (or <span className="font-semibold">Add to Home screen</span>). If you do not see it, the app may already be installed.
        </p>
      )}
    </div>
  );
}

// Slim dismissible banner, for the top of a page. Dismissal is per-session only
// (sessionStorage), so it never nags but comes back on a fresh visit.
export function InstallBanner() {
  const { canPrompt, promptInstall, ios, installed } = useInstallState();
  const [hidden, setHidden] = useState(() => {
    try { return sessionStorage.getItem('documate_install_dismissed') === '1'; } catch { return false; }
  });

  if (installed || hidden || (!canPrompt && !ios)) return null;

  const dismiss = () => {
    setHidden(true);
    try { sessionStorage.setItem('documate_install_dismissed', '1'); } catch { /* private mode */ }
  };

  return (
    <div className="flex items-center gap-2.5 bg-navy text-white px-3 py-2.5 rounded-2xl">
      <MonitorSmartphone size={17} className="shrink-0" />
      <div className="flex-1 text-[12px] leading-snug">
        {ios
          ? <>Add DocuMate to your home screen: <span className="font-semibold">Share</span>, then <span className="font-semibold">Add to Home Screen</span>.</>
          : <>Install DocuMate for full-screen access in the field.</>}
      </div>
      {!ios && canPrompt && (
        <button onClick={promptInstall} className="bg-white text-navy text-[12px] font-bold rounded-lg px-3 py-1.5 shrink-0">Install</button>
      )}
      <button onClick={dismiss} className="p-1 text-white/60 shrink-0" aria-label="Dismiss"><X size={15} /></button>
    </div>
  );
}