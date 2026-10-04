import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Colors } from '../../theme/colors';
import { ScreenType, useApp } from '../../context/AppContext';
import { HomeIcon, ClockIcon, CalendarIcon, DocumentIcon, SparklesIcon } from './Icons';

export function BottomNav() {
  const { currentScreen, setCurrentScreen, t } = useApp();

  const tabs: { key: ScreenType; label: string; icon: (color: string) => React.ReactNode }[] = [
    {
      key: 'home',
      label: t.tabHome,
      icon: (color) => <HomeIcon size={22} color={color} />,
    },
    {
      key: 'fichar',
      label: t.tabClock,
      icon: (color) => <ClockIcon size={22} color={color} />,
    },
    {
      key: 'solicitudes',
      label: t.tabRequests,
      icon: (color) => <CalendarIcon size={22} color={color} />,
    },
    {
      key: 'docs',
      label: t.tabDocs,
      icon: (color) => <DocumentIcon size={22} color={color} />,
    },
    {
      key: 'asistente',
      label: t.tabAssistant,
      icon: (color) => <SparklesIcon size={22} color={color} />,
    },
  ];

  return (
    <View style={styles.container}>
      {tabs.map((tab) => {
        const isActive = currentScreen === tab.key;
        const color = isActive ? Colors.accent : Colors.textSecondary;

        return (
          <TouchableOpacity
            key={tab.key}
            onPress={() => setCurrentScreen(tab.key)}
            style={styles.tabButton}
            activeOpacity={0.7}
          >
            {tab.icon(color)}
            <Text style={[styles.label, { color }]}>{tab.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: Colors.cardBg,
    borderTopWidth: 1,
    borderTopColor: Colors.cardBorder,
    paddingTop: 8,
    paddingBottom: 20,
    paddingHorizontal: 8,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
    gap: 4,
  },
  label: {
    fontSize: 11,
    fontWeight: '500',
  },
});
