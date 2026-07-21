import type { FC } from 'react';

/** Builds a rail-icon component that renders a config-provided image at the icon slot size. */
export function makeImageIcon(iconURL: string): FC<{ className?: string }> {
  return function ImageIcon({ className }: { className?: string }) {
    return <img src={iconURL} alt="" className={className} />;
  };
}
