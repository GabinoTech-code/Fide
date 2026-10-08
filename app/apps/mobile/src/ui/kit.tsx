// Small UI kit on the brand tokens (Colors = @fide/shared brand palette).
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { IconName } from '@fide/shared';
import { Colors } from '../theme/colors';
import { BrandIcon } from '../components/common/Icons';

export const Fonts = {
  display: 'SpaceGrotesk_700Bold',
  displayMedium: 'SpaceGrotesk_500Medium',
  text: 'IBMPlexSans_400Regular',
  textMedium: 'IBMPlexSans_500Medium',
  textBold: 'IBMPlexSans_600SemiBold',
  mono: 'IBMPlexMono_500Medium',
};

export function Screen({ children, dark, scroll = true }: { children: ReactNode; dark?: boolean; scroll?: boolean }) {
  const bg = dark ? Colors.dark : Colors.bg;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: bg }} edges={['top', 'left', 'right']}>
      {scroll ? (
        <ScrollView contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.screen, { flex: 1 }]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

export function Title({ children, light }: { children: ReactNode; light?: boolean }) {
  return <Text style={[styles.title, light && { color: Colors.textWhite }]}>{children}</Text>;
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <Text style={styles.eyebrow}>{children}</Text>;
}

export function Body({ children, muted, light, center }: { children: ReactNode; muted?: boolean; light?: boolean; center?: boolean }) {
  return (
    <Text style={[styles.body, muted && { color: Colors.textSecondary }, light && { color: Colors.accentRing }, center && { textAlign: 'center' }]}>
      {children}
    </Text>
  );
}

export function Mono({ children, style }: { children: ReactNode; style?: object }) {
  return <Text style={[styles.mono, style]}>{children}</Text>;
}

export function Card({ children, dark, style }: { children: ReactNode; dark?: boolean; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, dark && styles.cardDark, style]}>{children}</View>;
}

type ButtonKind = 'primary' | 'mint' | 'secondary' | 'danger';

export function Button({
  label,
  onPress,
  kind = 'primary',
  icon,
  busy,
  disabled,
}: {
  label: string;
  onPress: () => void;
  kind?: ButtonKind;
  icon?: IconName;
  busy?: boolean;
  disabled?: boolean;
}) {
  const palette = {
    primary: { bg: Colors.accent, fg: Colors.textWhite, border: Colors.accent },
    mint: { bg: Colors.accentLight, fg: Colors.dark, border: Colors.accentLight },
    secondary: { bg: Colors.cardBg, fg: Colors.textPrimary, border: Colors.cardBorderSubtle },
    danger: { bg: Colors.cardBg, fg: Colors.danger, border: Colors.cardBorderSubtle },
  }[kind];
  const off = disabled || busy;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: off, busy }}
      onPress={off ? undefined : onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: palette.bg, borderColor: palette.border, opacity: off ? 0.55 : pressed ? 0.85 : 1 },
      ]}
    >
      {busy ? <ActivityIndicator color={palette.fg} /> : icon ? <BrandIcon name={icon} size={20} color={palette.fg} /> : null}
      <Text style={[styles.buttonText, { color: palette.fg }]}>{label}</Text>
    </Pressable>
  );
}

export function Field({ label, ...input }: TextInputProps & { label: string }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput placeholderTextColor={Colors.textMuted} {...input} style={[styles.input, input.style]} />
    </View>
  );
}

export function Notice({ children, kind = 'info' }: { children: ReactNode; kind?: 'info' | 'warn' | 'danger' }) {
  const palette = {
    info: { bg: Colors.accentMuted, fg: Colors.success },
    warn: { bg: Colors.warningBg, fg: Colors.warningText },
    danger: { bg: Colors.dangerBg, fg: Colors.danger },
  }[kind];
  return (
    <View style={[styles.notice, { backgroundColor: palette.bg }]} accessibilityRole="alert">
      <Text style={[styles.body, { color: palette.fg, fontSize: 14 }]}>{children}</Text>
    </View>
  );
}

export function Badge({ label, kind = 'ok' }: { label: string; kind?: 'ok' | 'muted' | 'warn' | 'danger' }) {
  const palette = {
    ok: { bg: Colors.successBg, fg: Colors.success },
    muted: { bg: '#EEF1EF', fg: Colors.textSecondary },
    warn: { bg: Colors.warningBg, fg: Colors.warningText },
    danger: { bg: Colors.dangerBg, fg: Colors.danger },
  }[kind];
  return (
    <View style={[styles.badge, { backgroundColor: palette.bg }]}>
      <Text style={[styles.badgeText, { color: palette.fg }]}>{label}</Text>
    </View>
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
  screen: { padding: 20, gap: 16, paddingBottom: 40 },
  title: { fontFamily: Fonts.display, fontSize: 28, letterSpacing: -0.6, color: Colors.textPrimary },
  eyebrow: { fontFamily: Fonts.mono, fontSize: 12, letterSpacing: 1.4, textTransform: 'uppercase', color: Colors.accent },
  body: { fontFamily: Fonts.text, fontSize: 16, lineHeight: 23, color: Colors.textPrimary },
  mono: { fontFamily: Fonts.mono, fontSize: 13, color: Colors.textSecondary },
  card: { backgroundColor: Colors.cardBg, borderRadius: 20, borderWidth: 1, borderColor: Colors.cardBorder, padding: 18, gap: 10 },
  cardDark: { backgroundColor: Colors.dark, borderColor: Colors.dark },
  button: { minHeight: 52, borderRadius: 14, borderWidth: 1, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  buttonText: { fontFamily: Fonts.textBold, fontSize: 16 },
  label: { fontFamily: Fonts.textBold, fontSize: 13, color: Colors.textSecondary },
  input: { minHeight: 50, borderRadius: 12, borderWidth: 1, borderColor: Colors.cardBorderSubtle, backgroundColor: Colors.cardBg, paddingHorizontal: 14, fontFamily: Fonts.text, fontSize: 16, color: Colors.textPrimary },
  notice: { borderRadius: 14, padding: 14 },
  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start' },
  badgeText: { fontFamily: Fonts.textBold, fontSize: 12 },
  segmented: { flexDirection: 'row', backgroundColor: Colors.cardBg, borderRadius: 14, borderWidth: 1, borderColor: Colors.cardBorder, padding: 4, gap: 4 },
  segment: { flex: 1, minHeight: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  segmentOn: { backgroundColor: Colors.dark },
  segmentText: { fontFamily: Fonts.textBold, fontSize: 14, color: Colors.textPrimary },
});
