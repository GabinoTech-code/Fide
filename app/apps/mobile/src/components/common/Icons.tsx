import React from 'react';
import Svg, { Path, Rect, Circle, SvgProps } from 'react-native-svg';
import { brandColors, iconStroke, icons, logo, type IconName } from '@fide/shared';

interface IconProps extends SvgProps {
  size?: number;
  color?: string;
}

/** The Fide symbol: a key whose bit draws an F and whose bow is a clock (see @fide/shared brand). */
export function FideLogo({ size = 34, color = brandColors.mint, hands = true, ...props }: IconProps & { hands?: boolean }) {
  return (
    <Svg width={size} height={size} viewBox={logo.viewBox} fill="none" stroke={color} strokeWidth={logo.strokeWidth} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <Circle cx={logo.bow.cx} cy={logo.bow.cy} r={logo.bow.r} />
      <Path d={logo.bit} />
      {hands ? <Path d={logo.hands} strokeWidth={logo.handsStrokeWidth} /> : null}
    </Svg>
  );
}

/** One of the 24 brand icons (24 × 24 grid, stroke 1.75, thicker at small sizes). */
export function BrandIcon({ name, size = 24, color = brandColors.slate, ...props }: IconProps & { name: IconName }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={iconStroke(size)} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <Path d={icons[name]} />
    </Svg>
  );
}

export function ShieldPrivacyIcon({ size = 20, color = '#0F1A17', ...props }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <Path d="M12 2l8 3v6c0 5-3.4 9.3-8 11-4.6-1.7-8-6-8-11V5l8-3z" />
      <Circle cx={12} cy={10} r={2.5} />
      <Path d="M8 16c1-1.6 2.4-2.4 4-2.4s3 .8 4 2.4" />
    </Svg>
  );
}

export function HomeIcon({ size = 22, color = '#0F1A17', ...props }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <Path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-9z" />
    </Svg>
  );
}

export function ClockIcon({ size = 22, color = '#0F1A17', ...props }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <Circle cx={12} cy={13} r={8} />
      <Path d="M12 9v4l2.5 2.5M9 2h6" />
    </Svg>
  );
}

export function CalendarIcon({ size = 22, color = '#0B6E4F', ...props }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <Rect x={3} y={5} width={18} height={16} rx={3} />
      <Path d="M3 10h18M8 3v4M16 3v4" />
    </Svg>
  );
}

export function DocumentIcon({ size = 22, color = '#0F1A17', ...props }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <Path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5z" />
      <Path d="M14 3v5h5" />
    </Svg>
  );
}

export function SparklesIcon({ size = 22, color = '#0F1A17', ...props }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <Path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8L12 3z" />
      <Path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15z" />
    </Svg>
  );
}

export function ReceiptIcon({ size = 22, color = '#0B6E4F', ...props }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <Path d="M6 2h12v20l-3-2-3 2-3-2-3 2V2z" />
      <Path d="M9 7h6M9 11h6M9 15h3" />
    </Svg>
  );
}

export function ShiftSwapIcon({ size = 22, color = '#0B6E4F', ...props }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <Path d="M4 8h13l-3-3M20 16H7l3 3" />
    </Svg>
  );
}

export function LockIcon({ size = 20, color = '#0B6E4F', ...props }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <Rect x={5} y={11} width={14} height={10} rx={2} />
      <Path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </Svg>
  );
}

export function BellIcon({ size = 20, color = '#8A4B00', ...props }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <Path d="M4 5h16v11H8l-4 4V5z" />
    </Svg>
  );
}

export function PasskeyIcon({ size = 22, color = '#0F1A17', ...props }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <Path d="M7 3H5a2 2 0 0 0-2 2v2M17 3h2a2 2 0 0 1 2 2v2M7 21H5a2 2 0 0 1-2-2v-2M17 21h2a2 2 0 0 0 2-2v-2" />
      <Path d="M9 9v1M15 9v1M9.5 15.5c1.4 1 3.6 1 5 0M12 9v4h-1" />
    </Svg>
  );
}

export function SendIcon({ size = 18, color = '#FFFFFF', ...props }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <Path d="M22 2L11 13" />
      <Path d="M22 2l-7 20-4-9-9-4 20-7z" />
    </Svg>
  );
}

export function CloseIcon({ size = 20, color = '#0F1A17', ...props }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <Path d="M18 6L6 18M6 6l12 12" />
    </Svg>
  );
}

export function EditIcon({ size = 18, color = '#0B6E4F', ...props }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <Path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <Path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </Svg>
  );
}

export function CheckIcon({ size = 18, color = '#0B6E4F', ...props }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <Path d="M20 6L9 17l-5-5" />
    </Svg>
  );
}

export function GlobeIcon({ size = 20, color = '#0F1A17', ...props }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <Circle cx={12} cy={12} r={10} />
      <Path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </Svg>
  );
}

