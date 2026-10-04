import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Colors } from '../../theme/colors';
import { useApp } from '../../context/AppContext';
import { ShieldPrivacyIcon, EditIcon, GlobeIcon } from './Icons';
import { formatLocalizedDate, LANGUAGES } from '../../i18n';

interface HeaderProps {
  onOpenProfile: () => void;
  onOpenLanguage: () => void;
}

export function Header({ onOpenProfile, onOpenLanguage }: HeaderProps) {
  const { currentScreen, setCurrentScreen, user, language, t } = useApp();

  const currentLangMeta = LANGUAGES.find((l) => l.code === language) || LANGUAGES[0];

  const getHeaderInfo = () => {
    const today = new Date();
    const formattedDate = formatLocalizedDate(today, language);

    switch (currentScreen) {
      case 'home':
        return {
          subtitle: formattedDate,
          title: `${t.greeting}, ${user.name.split(' ')[0]}`,
        };
      case 'fichar':
        return {
          subtitle: t.clockSubtitle,
          title: t.clockTitle,
        };
      case 'solicitudes':
        return {
          subtitle: t.requestsSubtitle,
          title: t.requestsTitle,
        };
      case 'docs':
        return {
          subtitle: t.docsSubtitle,
          title: t.docsTitle,
        };
      case 'asistente':
        return {
          subtitle: t.assistantSubtitle,
          title: t.assistantTitle,
        };
      case 'privacidad':
        return {
          subtitle: t.privacySubtitle,
          title: t.privacyTitle,
        };
    }
  };

  const { subtitle, title } = getHeaderInfo();

  return (
    <View style={styles.container}>
      <View style={styles.textContainer}>
        <Text style={styles.subtitle}>{subtitle}</Text>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
      </View>

      <View style={styles.actions}>
        {/* Language selector button */}
        <TouchableOpacity
          onPress={onOpenLanguage}
          style={styles.langButton}
          accessibilityLabel="Cambia lingua / Cambiar idioma"
          activeOpacity={0.8}
        >
          <Text style={styles.flagIcon}>{currentLangMeta.flag}</Text>
          <Text style={styles.langCode}>{currentLangMeta.code.toUpperCase()}</Text>
        </TouchableOpacity>

        {/* Profile edit button */}
        <TouchableOpacity
          onPress={onOpenProfile}
          style={styles.iconButton}
          accessibilityLabel={t.profileTitle}
          activeOpacity={0.8}
        >
          <EditIcon size={18} color={Colors.accent} />
        </TouchableOpacity>

        {/* Privacy / GDPR button */}
        <TouchableOpacity
          onPress={() => {
            if (currentScreen === 'privacidad') {
              setCurrentScreen('home');
            } else {
              setCurrentScreen('privacidad');
            }
          }}
          style={[
            styles.iconButton,
            currentScreen === 'privacidad' && { backgroundColor: Colors.accentMuted, borderColor: Colors.accent },
          ]}
          accessibilityLabel={t.privacyTitle}
          activeOpacity={0.8}
        >
          <ShieldPrivacyIcon size={20} color={currentScreen === 'privacidad' ? Colors.accent : Colors.textPrimary} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.bg,
  },
  textContainer: {
    flex: 1,
    paddingRight: 10,
  },
  subtitle: {
    fontSize: 12,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontWeight: '500',
  },
  title: {
    fontSize: 25,
    fontWeight: '700',
    color: Colors.textPrimary,
    letterSpacing: -0.5,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  langButton: {
    height: 40,
    paddingHorizontal: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.cardBorderSubtle,
    backgroundColor: Colors.cardBg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  flagIcon: {
    fontSize: 16,
  },
  langCode: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.cardBorderSubtle,
    backgroundColor: Colors.cardBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
