import type { ReactNode } from "react";

export const iconNames = [
  "home",
  "feed",
  "listen",
  "epk",
  "merch",
  "play",
  "pause",
  "arrow",
] as const;

export type IconName = (typeof iconNames)[number];

const paths: Record<IconName, ReactNode> = {
  home: <path d="M3 10.5 12 3l9 7.5v9.25a1.25 1.25 0 0 1-1.25 1.25H4.25A1.25 1.25 0 0 1 3 19.75V10.5Zm6.5 10.5v-6h5v6" />,
  feed: <><path d="M4 5h16M4 12h16M4 19h16" /><circle cx="7" cy="5" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="17" cy="19" r="1" /></>,
  listen: <><path d="M9 18V6l9-2v12" /><circle cx="6.5" cy="18" r="2.5" /><circle cx="15.5" cy="16" r="2.5" /></>,
  epk: <><rect x="5" y="3" width="14" height="18" rx="1.5" /><path d="M8 8h8M8 12h8M8 16h5" /></>,
  merch: <path d="M8 4h8l4 4-3 3-2-1v10H9V10l-2 1-3-3 4-4Z" />,
  play: <path d="m9 5 10 7-10 7V5Z" />,
  pause: <><path d="M7 5h3v14H7zM14 5h3v14h-3z" /></>,
  arrow: <path d="M5 12h13M13 7l5 5-5 5" />,
};

export function Icon({ name, label }: { name: IconName; label?: string }) {
  return (
    <svg className="shell-icon" viewBox="0 0 24 24" role={label ? "img" : "presentation"} aria-hidden={label ? undefined : true} aria-label={label} focusable="false">
      {paths[name]}
    </svg>
  );
}
