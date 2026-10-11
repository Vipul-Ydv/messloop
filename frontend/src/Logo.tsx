// Original MessLoop mark: a rice bowl topped with a leaf, ringed by two circular
// "reuse" arrows. Pure SVG, no assets.

export function LogoMark({ size = 40, title }: { size?: number; title?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : true} focusable="false">
      <circle cx="32" cy="32" r="31" fill="#236B45" />
      <path d="M11.3 24.5A22 22 0 0 1 46.1 15.2" fill="none" stroke="#B7E445" strokeWidth="3.5" strokeLinecap="round" />
      <polygon points="50.7,19.1 43.5,18.3 48.7,12.1" fill="#B7E445" />
      <path d="M52.7 39.5A22 22 0 0 1 17.9 48.9" fill="none" stroke="#B7E445" strokeWidth="3.5" strokeLinecap="round" />
      <polygon points="13.3,45 20.5,45.8 15.3,52" fill="#B7E445" />
      <path d="M20 31h24c0 7.5-5 13-12 13s-12-5.5-12-13z" fill="#FFD45C" />
      <path d="M23.5 31a8.5 8.5 0 0 1 17 0z" fill="#FFF9ED" />
      <path d="M33 17.5c5.5.3 8.5 3.6 8.5 8.5-5.5 0-8.5-3.2-8.5-8.5z" fill="#B7E445" />
      <path d="M33.5 19.5c2.5 1.6 4.6 3.6 6 6" fill="none" stroke="#236B45" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M27 47h10" stroke="#FFD45C" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

export function Brand({ size = 40 }: { size?: number }) {
  return (
    <span className="brand-lockup">
      <LogoMark size={size} />
      <span className="wordmark">Mess<span>Loop</span></span>
    </span>
  );
}
