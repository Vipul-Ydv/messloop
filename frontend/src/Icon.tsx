// Inline icon set in one consistent style (24px grid, 2px round strokes): UI icons plus
// food icons. No icon package is installed, so the paths live here.

const PATHS = {
  // --- UI (names kept from the original set)
  loop: ["M3 12a9 9 0 0 1 15-6.7L21 8", "M21 3v5h-5", "M21 12a9 9 0 0 1-15 6.7L3 16", "M3 21v-5h5"],
  dashboard: ["M3 3h7v9H3z", "M14 3h7v5h-7z", "M14 12h7v9h-7z", "M3 16h7v5H3z"],
  log: ["M9 2h6v4H9z", "M9 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-3", "M9 12h6", "M9 16h4"],
  flask: ["M10 2v7.5L4.5 19a2 2 0 0 0 1.7 3h11.6a2 2 0 0 0 1.7-3L14 9.5V2", "M8.5 2h7"],
  check: ["M20 6 9 17l-5-5"],
  x: ["M18 6 6 18", "M6 6l12 12"],
  menu: ["M4 6h16", "M4 12h16", "M4 18h16"],
  arrowRight: ["M5 12h14", "M12 5l7 7-7 7"],
  arrowLeft: ["M19 12H5", "M12 19l-7-7 7-7"],
  alert: ["M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z", "M12 9v4", "M12 17h.01"],
  refresh: ["M3 12a9 9 0 0 1 15-6.7L21 8", "M21 3v5h-5", "M21 12a9 9 0 0 1-15 6.7L3 16", "M3 21v-5h5"],
  logout: ["M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4", "M16 17l5-5-5-5", "M21 12H9"],
  sparkle: ["M12 3l1.9 5.8L20 10l-6.1 1.2L12 17l-1.9-5.8L4 10l6.1-1.2z", "M19 16v4", "M17 18h4"],
  shield: ["M12 2l8 3v6c0 5-3.4 9.3-8 11-4.6-1.7-8-6-8-11V5z", "M9 12l2 2 4-4"],
  info: ["M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z", "M12 16v-4", "M12 8h.01"],
  clock: ["M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z", "M12 6v6l4 2"],
  chart: ["M3 3v18h18", "M7 15l4-4 3 3 5-6"],
  trendDown: ["M22 17l-8.5-8.5-5 5L2 7", "M16 17h6v-6"],
  trendUp: ["M22 7l-8.5 8.5-5-5L2 17", "M16 7h6v6"],
  equal: ["M5 9h14", "M5 15h14"],
  thumbsUp: ["M3 10h4v11H3z", "M7 10l4-7a2 2 0 0 1 2 2v4h6a2 2 0 0 1 2 2.3l-1.2 7A2 2 0 0 1 17.8 21H7"],
  // --- roles
  chef: ["M6 13.9V20h12v-6.1", "M17 14a4 4 0 0 0 .6-7.9 5 5 0 0 0-9.2 0A4 4 0 0 0 7 14", "M6 17h12"],
  cap: ["M22 10 12 5 2 10l10 5z", "M6 12v5c3 2 9 2 12 0v-5", "M22 10v6"],
  // --- food
  bowl: ["M3 11h18c0 5-4 9-9 9s-9-4-9-9z", "M9 20h6", "M8 7c0-1.5 1-1.5 1-3", "M12 7c0-1.5 1-1.5 1-3", "M16 7c0-1.5 1-1.5 1-3"],
  plate: ["M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z", "M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10z"],
  cutlery: ["M7 3v8", "M4 3v5a3 3 0 0 0 6 0V3", "M7 11v10", "M17 21V3c-2.5 1-4 4-4 8h4"],
  pot: ["M4 10h16v7a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3z", "M2 10h2", "M20 10h2", "M8 10V8h8v2", "M12 3v2"],
  tray: ["M2 16h20", "M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2", "M5 16c0-4 3-6.5 7-6.5s7 2.5 7 6.5", "M12 7V9.5"],
  scale: ["M6 3h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z", "M8 10a4 4 0 0 1 8 0z", "M12 10l1.5-3"],
  tomato: ["M12 7c-4.5 0-8 2.8-8 7s3.5 7 8 7 8-2.8 8-7-3.5-7-8-7z", "M12 7 9 4", "M12 7l3-3", "M12 7V3"],
  carrot: ["M4 20 9.5 9.5a2 2 0 0 1 3.2-.5l2.3 2.3a2 2 0 0 1-.5 3.2z", "M10.5 8 9 4", "M13.5 8.5 17 6", "M15.5 11 20 10"],
  leaf: ["M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.5 19 2c1 2 2 4.2 2 8 0 5.5-4.8 10-10 10z", "M2 21c0-3 1.9-5.4 5.7-7.5 1.4-.8 3.2-1.5 5.3-2"],
  sprout: ["M12 22V12", "M12 12C12 8 9 6 5 6c0 4 3 6 7 6z", "M12 14c0-3.5 2.5-6 7-6 0 3.5-2.5 6-7 6z"],
  apple: ["M12 7c-1-1.5-3-2-5-1-2.5 1.5-3 5-1.5 9 1.2 3 3 5 4.5 5 1 0 1.2-.5 2-.5s1 .5 2 .5c1.5 0 3.3-2 4.5-5 1.5-4 1-7.5-1.5-9-2-1-4-.5-5 1z", "M12 7c0-2 1-3.5 3-4"],
  chapati: ["M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16z", "M9 10h.01", "M14 9h.01", "M15 14h.01", "M10 15h.01"],
  drop: ["M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"],
  compost: ["M5 7h14l-1.2 13H6.2z", "M3 7h18", "M9 7V4h6v3", "M10 11v6", "M14 11v6"],
} satisfies Record<string, readonly string[]>;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 18, strokeWidth = 2 }: { name: IconName; size?: number; strokeWidth?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {PATHS[name].map((d, i) => <path key={i} d={d} />)}
    </svg>
  );
}
