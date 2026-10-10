// Navigation lives here, not in App.tsx, so pages can use it without importing App
// (a circular import breaks React Fast Refresh).
export const go = (path: string) => { window.location.hash = path; };
