// UI kit on the brand tokens, matching the design prototype
// (prototype/App Fide · prototipo interactivo-html): sizes, radii and colours
// come from its inline styles.
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { IconName } from '@fide/shared';
import { Colors } from '../theme/colors';
import { BrandIcon, ShieldPrivacyIcon } from '../components/common/Icons';

export const Fonts = {
  display: 'SpaceGrotesk_700Bold',
  displayMedium: 'SpaceGrotesk_500Medium',
  text: 'IBMPlexSans_400Regular',
  textMedium: 'IBMPlexSans_500Medium',
  textBold: 'IBMPlexSans_600SemiBold',
  mono: 'IBMPlexMono_500Medium',
};

export function Screen({
  children,
  dark,
  scroll = true,
  refresh,
}: {
  children: ReactNode;
  dark?: boolean;
  scroll?: boolean;
  /** Pull-to-refresh, from useLiveQueries. */
  refresh?: { refreshing: boolean; onRefresh: () => void };
}) {
  const bg = dark ? Colors.dark : Colors.bg;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: bg }} edges={['top', 'left', 'right']}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={[styles.screen, dark && styles.screenDark]}
          keyboardShouldPersistTaps="handled"
          refreshControl={refresh ? <RefreshControl {...refresh} colors={[Colors.accent]} tintColor={Colors.accent} /> : undefined}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.screen, dark && styles.screenDark, { flex: 1 }]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

/** Screen header: eyebrow, title and the round privacy button of the prototype. */
export function Header({
  eyebrow,
  title,
  privacy = true,
  privacyLabel,
  onClose,
  closeLabel,
}: {
  eyebrow?: string;
  title: string;
  privacy?: boolean;
  privacyLabel?: string;
  /** Replaces the privacy button with a close button (on the My data screen). */
  onClose?: () => void;
  closeLabel?: string;
}) {
  return (
    <View style={styles.header}>
      <View style={{ flex: 1, gap: 2 }}>
        {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
        <Title>{title}</Title>
      </View>
      {onClose ? (
        <Pressable accessibilityRole="button" accessibilityLabel={closeLabel} onPress={onClose} style={({ pressed }) => [styles.roundButton, pressed && { opacity: 0.8 }]}>
          <Text style={styles.close}>×</Text>
        </Pressable>
      ) : privacy ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={privacyLabel}
          onPress={() => router.navigate('/(tabs)/privacy')}
          style={({ pressed }) => [styles.roundButton, pressed && { opacity: 0.8 }]}
        >
          <ShieldPrivacyIcon size={20} color={Colors.textPrimary} />
        </Pressable>
      ) : null}
    </View>
  );
}

export function Title({ children, light }: { children: ReactNode; light?: boolean }) {
  return <Text style={[styles.title, light && { color: Colors.bg }]}>{children}</Text>;
}

export function Eyebrow({ children, light }: { children: ReactNode; light?: boolean }) {
  return <Text style={[styles.eyebrow, light && { color: Colors.textMuted }]}>{children}</Text>;
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <Text style={styles.section}>{children}</Text>;
}

export function Body({ children, muted, light, center }: { children: ReactNode; muted?: boolean; light?: boolean; center?: boolean }) {
  return (
    <Text style={[styles.body, muted && { color: Colors.textSecondary }, light && { color: Colors.textLight }, center && { textAlign: 'center' }]}>
      {children}
    </Text>
  );
}

/** 13 px secondary text, for details under a title. */
export function Small({ children, light, color }: { children: ReactNode; light?: boolean; color?: string }) {
  return <Text style={[styles.small, light && { color: Colors.textMuted }, color ? { color } : null]}>{children}</Text>;
}

export function Strong({ children, size = 14, light }: { children: ReactNode; size?: number; light?: boolean }) {
  return <Text style={[styles.strong, { fontSize: size }, light && { color: Colors.bg }]}>{children}</Text>;
}

export function Mono({ children, style }: { children: ReactNode; style?: object }) {
  return <Text style={[styles.mono, style]}>{children}</Text>;
}

export function Card({ children, dark, style }: { children: ReactNode; dark?: boolean; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, dark && styles.cardDark, style]}>{children}</View>;
}

type ButtonKind = 'primary' | 'mint' | 'secondary' | 'outline' | 'danger' | 'soft';

export function Button({
  label,
  onPress,
  kind = 'primary',
  icon,
  busy,
  disabled,
  style,
}: {
  label: string;
  onPress: () => void;
  kind?: ButtonKind;
  icon?: IconName;
  busy?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const palette = {
    primary: { bg: Colors.accent, fg: Colors.textWhite, border: Colors.accent, width: 0 },
    mint: { bg: Colors.accentLight, fg: Colors.dark, border: Colors.accentLight, width: 0 },
    secondary: { bg: Colors.cardBg, fg: Colors.textPrimary, border: Colors.chipBorder, width: 1 },
    outline: { bg: 'transparent', fg: Colors.textPrimary, border: Colors.textPrimary, width: 1.5 },
    danger: { bg: 'transparent', fg: Colors.danger, border: Colors.danger, width: 1.5 },
    soft: { bg: Colors.softButton, fg: Colors.textPrimary, border: Colors.softButton, width: 0 },
  }[kind];
  const off = disabled || busy;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: off, busy }}
      onPress={off ? undefined : onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: palette.bg, borderColor: palette.border, borderWidth: palette.width, opacity: off ? 0.55 : pressed ? 0.85 : 1 },
        style,
      ]}
    >
      {busy ? <ActivityIndicator color={palette.fg} /> : icon ? <BrandIcon name={icon} size={20} color={palette.fg} /> : null}
      <Text style={[styles.buttonText, { color: palette.fg }]}>{label}</Text>
    </Pressable>
  );
}

export function Field({ label, dark, ...input }: TextInputProps & { label: string; dark?: boolean }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={[styles.label, dark && { color: Colors.textLight }]}>{label}</Text>
      <TextInput
        placeholderTextColor={Colors.textMuted}
        {...input}
        style={[styles.input, dark && styles.inputDark, input.multiline && { minHeight: 64, paddingTop: 10, textAlignVertical: 'top' }, input.style]}
      />
    </View>
  );
}

export function Notice({ children, kind = 'info' }: { children: ReactNode; kind?: 'info' | 'warn' | 'danger' }) {
  const palette = {
    info: { bg: Colors.accentMuted, fg: Colors.infoText },
    warn: { bg: Colors.warningBg, fg: Colors.warningText },
    danger: { bg: Colors.dangerBg, fg: Colors.danger },
  }[kind];
  return (
    <View style={[styles.notice, { backgroundColor: palette.bg }]} accessibilityRole="alert">
      <BrandIcon name="misdatos" size={18} color={palette.fg} />
      <Text style={[styles.small, { color: palette.fg, flex: 1, lineHeight: 19 }]}>{children}</Text>
    </View>
  );
}

export type BadgeKind = 'ok' | 'muted' | 'warn' | 'danger';

export function Badge({ label, kind = 'ok' }: { label: string; kind?: BadgeKind }) {
  const palette = {
    ok: { bg: Colors.successBg, fg: Colors.success },
    muted: { bg: Colors.neutralTile, fg: Colors.textSecondary },
    warn: { bg: Colors.warningBg, fg: Colors.pendingText },
    danger: { bg: Colors.dangerBg, fg: Colors.danger },
  }[kind];
  return (
    <View style={[styles.badge, { backgroundColor: palette.bg }]}>
      <Text style={[styles.badgeText, { color: palette.fg }]}>{label}</Text>
    </View>
  );
}

/** Selectable tile (verification method, request type). */
export function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.chip, { borderColor: selected ? Colors.accent : Colors.chipBorder, backgroundColor: selected ? Colors.accentMuted : Colors.cardBg }]}
    >
      <Text style={styles.chipText} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Grid of chips: two or three columns. */
export function ChipGrid({ children, columns = 2 }: { children: ReactNode; columns?: 2 | 3 }) {
  return <View style={styles.chipGrid}>{wrapColumns(children, columns)}</View>;
}

function wrapColumns(children: ReactNode, columns: number): ReactNode {
  const items = (Array.isArray(children) ? children.flat() : [children]).filter(Boolean);
  return items.map((child, i) => (
    <View key={i} style={{ width: `${100 / columns - (columns === 2 ? 1.5 : 2)}%`, flexGrow: 1 }}>
      {child}
    </View>
  ));
}

export type Tone = 'mint' | 'neutral' | 'amber' | 'danger';

const TONES: Record<Tone, { bg: string; fg: string }> = {
  mint: { bg: Colors.accentMuted, fg: Colors.accent },
  neutral: { bg: Colors.neutralTile, fg: Colors.textPrimary },
  amber: { bg: Colors.warningBg, fg: Colors.warningText },
  danger: { bg: Colors.dangerBg, fg: Colors.danger },
};

/** A row card: icon tile, title, subtitle and something on the right. */
export function ListItem({
  icon,
  tone = 'neutral',
  title,
  subtitle,
  subtitleColor,
  trailing,
  onPress,
  disabled,
}: {
  icon?: IconName;
  tone?: Tone;
  title: string;
  subtitle?: string;
  subtitleColor?: string;
  trailing?: ReactNode;
  onPress?: () => void;
  disabled?: boolean;
}) {
  const body = (
    <>
      {icon ? (
        <View style={[styles.tile, { backgroundColor: TONES[tone].bg }]}>
          <BrandIcon name={icon} size={20} color={TONES[tone].fg} />
        </View>
      ) : null}
      <View style={{ flex: 1, gap: 2 }}>
        <Strong>{title}</Strong>
        {subtitle ? <Text style={[styles.meta, subtitleColor ? { color: subtitleColor } : null]}>{subtitle}</Text> : null}
      </View>
      {trailing}
    </>
  );
  if (!onPress) return <View style={styles.listItem}>{body}</View>;
  return (
    <Pressable accessibilityRole="button" onPress={onPress} disabled={disabled} style={({ pressed }) => [styles.listItem, pressed && { opacity: 0.85 }]}>
      {body}
    </Pressable>
  );
}

/** Quick action of the home screen: a 56 px tile with a caption. */
export function QuickAction({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.quick, pressed && { opacity: 0.8 }]}>
      <View style={styles.quickTile}>
        <BrandIcon name={icon} size={22} color={Colors.accent} />
      </View>
      <Text style={styles.quickText} numberOfLines={2}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Bottom sheet over a dimmed backdrop. */
export function Sheet({ visible, onClose, children }: { visible: boolean; onClose: () => void; children: ReactNode }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" />
      <SafeAreaView edges={['bottom']} style={styles.sheet}>
        {children}
      </SafeAreaView>
    </Modal>
  );
}

export function Row({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }, style]}>{children}</View>;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={styles.segmented} accessibilityRole="tablist">
      {options.map((o) => (
        <Pressable
          key={o.value}
          accessibilityRole="tab"
          accessibilityState={{ selected: o.value === value }}
          onPress={() => onChange(o.value)}
          style={[styles.segment, o.value === value && styles.segmentOn]}
        >
          <Text style={[styles.segmentText, o.value === value && { color: Colors.textWhite }]}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 32, gap: 16 },
  screenDark: { paddingHorizontal: 28, paddingTop: 48, paddingBottom: 40, gap: 18, flexGrow: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: -4 },
  close: { fontFamily: Fonts.text, fontSize: 26, lineHeight: 28, color: Colors.textPrimary },
  roundButton: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: Colors.chipBorder, backgroundColor: Colors.cardBg, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: Fonts.display, fontSize: 26, letterSpacing: -0.5, color: Colors.textPrimary },
  eyebrow: { fontFamily: Fonts.text, fontSize: 12, letterSpacing: 1.2, textTransform: 'uppercase', color: Colors.textSecondary },
  section: { fontFamily: Fonts.textBold, fontSize: 15, color: Colors.textPrimary },
  body: { fontFamily: Fonts.text, fontSize: 15, lineHeight: 22, color: Colors.textPrimary },
  small: { fontFamily: Fonts.text, fontSize: 13, lineHeight: 18, color: Colors.textSecondary },
  strong: { fontFamily: Fonts.textBold, color: Colors.textPrimary },
  meta: { fontFamily: Fonts.text, fontSize: 12, color: Colors.textSecondary },
  mono: { fontFamily: Fonts.mono, fontSize: 13, color: Colors.textSecondary },
  card: { backgroundColor: Colors.cardBg, borderRadius: 18, borderWidth: 1, borderColor: Colors.cardBorder, padding: 16, gap: 12 },
  cardDark: { backgroundColor: Colors.dark, borderColor: Colors.dark, borderRadius: 22, padding: 20, gap: 14 },
  button: { minHeight: 48, borderRadius: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  buttonText: { fontFamily: Fonts.textBold, fontSize: 15, textAlign: 'center' },
  label: { fontFamily: Fonts.textMedium, fontSize: 13, color: Colors.textPrimary },
  input: { minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: Colors.chipBorder, backgroundColor: Colors.inputBg, paddingHorizontal: 12, fontFamily: Fonts.text, fontSize: 15, color: Colors.textPrimary },
  inputDark: { backgroundColor: Colors.darkCard, borderColor: Colors.darkBorder, color: Colors.bg },
  notice: { borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14, flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, alignSelf: 'flex-start' },
  badgeText: { fontFamily: Fonts.textBold, fontSize: 12 },
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 48, borderRadius: 14, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  chipText: { fontFamily: Fonts.textMedium, fontSize: 14, color: Colors.textPrimary },
  listItem: { backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.cardBorder, borderRadius: 16, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  tile: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  quick: { flex: 1, alignItems: 'center', gap: 6 },
  quickTile: { width: 56, height: 56, borderRadius: 18, backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.cardBorder, alignItems: 'center', justifyContent: 'center' },
  quickText: { fontFamily: Fonts.text, fontSize: 12, color: Colors.textPrimary, textAlign: 'center' },
  backdrop: { flex: 1, backgroundColor: Colors.backdrop },
  sheet: { backgroundColor: Colors.cardBg, borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingHorizontal: 20, paddingTop: 22, paddingBottom: 12, gap: 14 },
  segmented: { flexDirection: 'row', backgroundColor: Colors.cardBg, borderRadius: 14, borderWidth: 1, borderColor: Colors.cardBorder, padding: 4, gap: 4 },
  segment: { flex: 1, minHeight: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  segmentOn: { backgroundColor: Colors.dark },
  segmentText: { fontFamily: Fonts.textBold, fontSize: 14, color: Colors.textPrimary },
});
