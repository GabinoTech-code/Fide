import React from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView } from 'react-native';
import { Colors } from '../../theme/colors';
import { SupportedLanguage, LANGUAGES } from '../../i18n';
import { CloseIcon, CheckIcon } from '../common/Icons';

interface LanguageSelectorModalProps {
  visible: boolean;
  currentLanguage: SupportedLanguage;
  onClose: () => void;
  onSelectLanguage: (lang: SupportedLanguage) => void;
}

export function LanguageSelectorModal({
  visible,
  currentLanguage,
  onClose,
  onSelectLanguage,
}: LanguageSelectorModalProps) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View>
              <Text style={styles.subtitle}>Lingua / Idioma / Language</Text>
              <Text style={styles.title}>Seleziona lingua</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <CloseIcon size={20} color={Colors.textPrimary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
            {LANGUAGES.map((item) => {
              const isSelected = currentLanguage === item.code;
              return (
                <TouchableOpacity
                  key={item.code}
                  style={[
                    styles.langRow,
                    isSelected && styles.langRowActive,
                  ]}
                  onPress={() => {
                    onSelectLanguage(item.code);
                    onClose();
                  }}
                  activeOpacity={0.7}
                >
                  <View style={styles.langLeft}>
                    <Text style={styles.flag}>{item.flag}</Text>
                    <View style={styles.langNames}>
                      <Text style={[styles.nativeName, isSelected && { color: Colors.accent, fontWeight: '700' }]}>
                        {item.nativeName}
                      </Text>
                      <Text style={styles.latinName}>{item.name}</Text>
                    </View>
                  </View>

                  {isSelected && (
                    <View style={styles.checkWrap}>
                      <CheckIcon size={18} color={Colors.accent} />
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 26, 23, 0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.cardBg,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    maxHeight: '80%',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.cardBorder,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  subtitle: {
    fontSize: 12,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  closeBtn: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: Colors.bg,
  },
  scroll: {
    paddingHorizontal: 16,
  },
  scrollContent: {
    paddingVertical: 14,
    gap: 8,
  },
  langRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: Colors.bg,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  langRowActive: {
    borderColor: Colors.accent,
    backgroundColor: Colors.accentMuted,
  },
  langLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  flag: {
    fontSize: 24,
  },
  langNames: {
    gap: 2,
  },
  nativeName: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  latinName: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  checkWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.cardBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
