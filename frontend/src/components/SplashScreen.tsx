import { useEffect, useState } from 'react';
import { Logo } from './Loader';

// Cold-start splash. Covers the screen with the DocuMate logo on a clean field
// until the app shell has mounted, then fades away to reveal the app. Sits above
// everything (z-100).
//
// Timing: reveals a short beat after mount so the shell is painted underneath
// before the fade, and so it doesn't flicker on fast loads. To wait for auth/org
// to resolve instead of a fixed beat, gate `revealed` on a ready flag from those
// contexts.
export function SplashScreen() {
  const [revealed, setRevealed] = useState(false);
  const [removed, setRemoved] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setRevealed(true), 600);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!revealed) return;
    const t = setTimeout(() => setRemoved(true), 450); // matches the fade duration
    return () => clearTimeout(t);
  }, [revealed]);

  if (removed) return null;

  return (
    <div
      className={`fixed inset-0 z-[100] flex items-center justify-center bg-[#EDF1F6] transition-opacity duration-[450ms] ease-out ${revealed ? 'opacity-0' : 'opacity-100'}`}
    >
      <Logo className="h-14 w-auto animate-pulse" />
    </div>
  );
}