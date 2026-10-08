import { brandColors, iconStroke, icons, logo, type IconName } from '@fide/shared';

export function Logo({ size = 32, color = brandColors.mint, hands = true }: { size?: number; color?: string; hands?: boolean }) {
  return (
    <svg width={size} height={size} viewBox={logo.viewBox} fill="none" stroke={color} strokeWidth={logo.strokeWidth} strokeLinecap="round" strokeLinejoin="round" role="img" aria-label="Fide">
      <circle cx={logo.bow.cx} cy={logo.bow.cy} r={logo.bow.r} />
      <path d={logo.bit} />
      {hands ? <path d={logo.hands} strokeWidth={logo.handsStrokeWidth} /> : null}
    </svg>
  );
}

export function Icon({ name, size = 20, color = 'currentColor' }: { name: IconName; size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={iconStroke(size)} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={icons[name]} />
    </svg>
  );
}
