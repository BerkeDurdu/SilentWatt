import type { ReactElement } from 'react';
import type { ScreenKey } from '../../shared/types';

const PATHS = {
  bell: <><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></>,
  chart: <><path d="M3 3v18h18" /><path d="M7 15l4-4 3 3 6-6" /></>,
  list: <><path d="M8 6h13M8 12h13M8 18h13" /><path d="M3 6h.01M3 12h.01M3 18h.01" /></>,
  wrench: <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.5-.5-.5-2.5z" />,
  database: <><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5" /><path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" /></>,
  shield: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="M9 12l2 2 4-4" /></>,
  users: <><circle cx="9" cy="8" r="4" /><path d="M2 21a7 7 0 0 1 14 0" /><path d="M16 4a4 4 0 0 1 0 8M22 21a7 7 0 0 0-4-6.3" /></>,
  file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M8 13h8M8 17h5" /></>,
  lock: <><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>,
  eye: <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></>,
  step: <path d="M4 16h7v-6h9" />,
  back: <path d="M19 12H5M12 19l-7-7 7-7" />,
  send: <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />,
  check: <path d="M20 6L9 17l-5-5" />,
  logout: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5M21 12H9" /></>,
  spark: <><path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z" /><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" /></>,
  download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M7 10l5 5 5-5M12 15V3" /></>,
};

export type IconName = keyof typeof PATHS;

export function Icon({ name, className }: { name: IconName; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[name]}
    </svg>
  );
}

export const SCREEN_ICON: Record<ScreenKey, IconName> = {
  overview: 'chart',
  queue: 'list',
  team: 'users',
  reports: 'file',
  data: 'database',
  users: 'shield',
  jobs: 'wrench',
};

/* ── brand mark ────────────────────────────────────────── */

const GREEN = '#16A34A';
const AMBER = '#F2A33A';
const INK = '#14211A';

export type LogoVariant = 'leaf' | 'wave' | 'dial';

/** Switch the product mark here. All three are compared side by side in docs/logo-secenekleri.html. */
export const LOGO_VARIANT: LogoVariant = 'leaf';

const MARKS: Record<LogoVariant, ReactElement> = {
  // Leaf whose vein is a lightning bolt: clean energy at a glance.
  leaf: (
    <>
      <path d="M41 7C22 7 7 16 7 31c0 5.5 2.6 9.3 6.6 10.8C31 41 42 27 41 7z" fill={GREEN} />
      <path d="M13.6 41.8 8.5 45.5" stroke={GREEN} strokeWidth="3" strokeLinecap="round" />
      <path d="M27.5 14 19 28h6.5l-3.5 10.5L32 23.5h-6.5L27.5 14z" fill="#fff" />
    </>
  ),
  // A load wave that falls silent, with the hidden loss caught at the end.
  wave: (
    <>
      <rect x="2" y="2" width="44" height="44" rx="12" fill={GREEN} />
      <path d="M9 24c2.6-7 5.4-7 8 0s5.4 7 8 0h8" stroke="#fff" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="38.5" cy="24" r="3.6" fill={AMBER} />
    </>
  ),
  // A meter dial reading into the amber: where the waste shows up.
  dial: (
    <>
      <path d="M10.1 34A16 16 0 1 1 37.9 18" stroke={GREEN} strokeWidth="5" strokeLinecap="round" />
      <path d="M37.9 18A16 16 0 0 1 37.9 34" stroke={AMBER} strokeWidth="5" strokeLinecap="round" />
      <path d="M24 26l8-8" stroke={INK} strokeWidth="3.4" strokeLinecap="round" />
      <circle cx="24" cy="26" r="3.6" fill={INK} />
    </>
  ),
};

export function Logo({ size = 32, variant = LOGO_VARIANT }: { size?: number; variant?: LogoVariant }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true">
      {MARKS[variant]}
    </svg>
  );
}

export function Wordmark() {
  return <span className="wordmark">Silent<b>Watt</b></span>;
}
