// Month calendar for leave and forgotten-punch requests: picks one day or a
// range (first tap = start, second tap = end). Plain JS, no native module.
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { isItalianWorkingDay, romeDate } from '@fide/shared';
import { useT } from '../i18n/app';
import { Colors } from '../theme/colors';
import { Fonts } from './kit';

export interface Range {
  from: string | null;
  to: string | null;
}

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;

/** Today in Italy, whatever the phone's time zone. */
export function todayIso(): string {
  return romeDate(new Date());
}

export function Calendar({
  value,
  onChange,
  mode,
  min,
  max,
}: {
  value: Range;
  onChange: (next: Range) => void;
  mode: 'range' | 'single';
  min?: string;
  max?: string;
}) {
  const { t, format } = useT();
  const start = value.from ?? todayIso();
  const [cursor, setCursor] = useState(() => ({ y: Number(start.slice(0, 4)), m: Number(start.slice(5, 7)) - 1 }));

  const first = new Date(Date.UTC(cursor.y, cursor.m, 1));
  const days = new Date(Date.UTC(cursor.y, cursor.m + 1, 0)).getUTCDate();
  // Monday first, as on Italian calendars.
  const lead = (first.getUTCDay() + 6) % 7;
  const cells: (string | null)[] = [...Array<null>(lead).fill(null), ...Array.from({ length: days }, (_, i) => iso(cursor.y, cursor.m, i + 1))];
  while (cells.length % 7) cells.push(null);

  const weekdays = Array.from({ length: 7 }, (_, i) => format(new Date(Date.UTC(2026, 0, 5 + i, 12)), { weekday: 'narrow' }));
  const move = (delta: number) => setCursor(({ y, m }) => ({ y: m + delta < 0 ? y - 1 : m + delta > 11 ? y + 1 : y, m: (m + delta + 12) % 12 }));

  const pick = (day: string) => {
    if (mode === 'single') return onChange({ from: day, to: day });
    if (!value.from || (value.to && value.to !== value.from) || day < value.from) return onChange({ from: day, to: day });
    onChange({ from: value.from, to: day });
  };

  return (
    <View style={{ gap: 8 }}>
      <View style={styles.head}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('calendar.prev')} onPress={() => move(-1)} style={styles.nav} hitSlop={8}>
          <Text style={styles.navText}>‹</Text>
        </Pressable>
        <Text style={styles.month}>{format(new Date(Date.UTC(cursor.y, cursor.m, 15)), { month: 'long', year: 'numeric' })}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={t('calendar.next')} onPress={() => move(1)} style={styles.nav} hitSlop={8}>
          <Text style={styles.navText}>›</Text>
        </Pressable>
      </View>
      <View style={styles.grid}>
        {weekdays.map((w, i) => (
          <Text key={`w${i}`} style={[styles.cell, styles.weekday]}>
            {w}
          </Text>
        ))}
        {cells.map((day, i) => {
          if (!day) return <View key={`e${i}`} style={styles.cell} />;
          const disabled = Boolean((min && day < min) || (max && day > max));
          const edge = day === value.from || day === value.to;
          const inside = Boolean(value.from && value.to && day > value.from && day < value.to);
          const off = !isItalianWorkingDay(day);
          return (
            <Pressable
              key={day}
              accessibilityRole="button"
              accessibilityState={{ selected: edge || inside, disabled }}
              accessibilityLabel={format(`${day}T12:00:00Z`, { weekday: 'long', day: 'numeric', month: 'long' })}
              disabled={disabled}
              onPress={() => pick(day)}
              style={[styles.cell, inside && styles.inside, edge && styles.edge]}
            >
              <Text style={[styles.day, off && { color: Colors.textMuted }, disabled && { opacity: 0.35 }, edge && { color: Colors.textWhite }]}>
                {Number(day.slice(8))}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  nav: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: Colors.chipBorder, alignItems: 'center', justifyContent: 'center' },
  navText: { fontFamily: Fonts.textBold, fontSize: 20, lineHeight: 22, color: Colors.textPrimary },
  month: { fontFamily: Fonts.textBold, fontSize: 15, color: Colors.textPrimary, textTransform: 'capitalize' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  weekday: { height: 24, fontFamily: Fonts.text, fontSize: 12, color: Colors.textSecondary, textAlign: 'center', textTransform: 'uppercase' },
  day: { fontFamily: Fonts.textMedium, fontSize: 15, color: Colors.textPrimary },
  inside: { backgroundColor: Colors.accentMuted, borderRadius: 0 },
  edge: { backgroundColor: Colors.accent },
});
