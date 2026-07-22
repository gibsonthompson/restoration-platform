// The DocuMate logo (icon + wordmark), served from /public so updating the SVG
// changes it everywhere. `color` for light surfaces (loading screens), `white`
// for dark ones (the navy app header, where the near-black "Docu" would vanish).
export function Logo({ className = 'h-12 w-auto', variant = 'color' }:
  { className?: string; variant?: 'color' | 'white' }) {
  const src = variant === 'white' ? '/restomate-logo-white.svg' : '/restomate-logo.svg';
  return <img src={src} alt="DocuMate" className={className} />;
}

// In-page branded loading state: the full logo centered in the available space.
// Used wherever a page holds until its data is in, then reveals.
export function Loader() {
  return (
    <div className="min-h-[45vh] w-full flex items-center justify-center px-8">
      <Logo className="h-11 w-auto animate-pulse" />
    </div>
  );
}