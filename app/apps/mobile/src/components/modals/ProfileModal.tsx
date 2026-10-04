import React, { useState } from 'react';
import { View, Text, StyleSheet, Modal, TextInput, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { Colors } from '../../theme/colors';
import { UserProfile } from '../../types';
import { CloseIcon, GlobeIcon } from '../common/Icons';
import { useApp } from '../../context/AppContext';
import { LANGUAGES } from '../../i18n';

interface ProfileModalProps {
  visible: boolean;
  user: UserProfile;
  onClose: () => void;
  onSave: (updated: UserProfile) => void;
  onResetData: () => void;
  onOpenLanguage: () => void;
}

export function ProfileModal({
  visible,
  user,
  onClose,
  onSave,
  onResetData,
  onOpenLanguage,
}: ProfileModalProps) {
  const { t, language } = useApp();

  const [name, setName] = useState(user.name);
  const [company, setCompany] = useState(user.company);
  const [department, setDepartment] = useState(user.department);
  const [vacationQuota, setVacationQuota] = useState(String(user.vacationQuotaDays));
  const [permitQuota, setPermitQuota] = useState(String(user.permitQuotaHours));
  const [shiftSchedule, setShiftSchedule] = useState(user.shiftSchedule);

  const currentLangMeta = LANGUAGES.find((l) => l.code === language) || LANGUAGES[0];

  const handleSave = () => {
    onSave({
      ...user,
      name: name.trim() || 'Collaboratore',
      company: company.trim() || 'Azienda',
      department: department.trim() || 'Generale',
      vacationQuotaDays: parseFloat(vacationQuota) || 22,
      permitQuotaHours: parseFloat(permitQuota) || 32,
      shiftSchedule: shiftSchedule.trim() || '08:30 - 17:30',
    });
    onClose();
  };

  const handleConfirmReset = () => {
    Alert.alert(
      t.resetAll,
      'Confermi il ripristino di tutti i dati salvati su questo dispositivo?',
      [
        { text: t.cancel, style: 'cancel' },
        {
          text: t.resetAll,
          style: 'destructive',
          onPress: () => {
            onResetData();
            onClose();
          },
        },
      ]
    );
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View>
              <Text style={styles.subtitle}>{t.profileSubtitle}</Text>
              <Text style={styles.title}>{t.profileTitle}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <CloseIcon size={20} color={Colors.textPrimary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
            <Text style={styles.hint}>{t.profileHint}</Text>

            {/* Language switch button */}
            <View style={styles.field}>
              <Text style={styles.label}>{t.languageSelect}</Text>
              <TouchableOpacity
                style={styles.langSelectorBtn}
                onPress={() => {
                  onClose();
                  onOpenLanguage();
                }}
                activeOpacity={0.8}
              >
                <View style={styles.langLeft}>
                  <Text style={styles.flagEmoji}>{currentLangMeta.flag}</Text>
                  <Text style={styles.langNameText}>{currentLangMeta.nativeName}</Text>
                </View>
                <Text style={styles.changeLangText}>Cambia →</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>{t.fullName}</Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="Ej. Marco Rossi / Carlos Mendoza"
                placeholderTextColor={Colors.textMuted}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>{t.companyName}</Text>
              <TextInput
                style={styles.input}
                value={company}
                onChangeText={setCompany}
                placeholder="Ej. Officine Aurora S.r.l."
                placeholderTextColor={Colors.textMuted}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>{t.department}</Text>
              <TextInput
                style={styles.input}
                value={department}
                onChangeText={setDepartment}
                placeholder="Ej. Operazioni / Logistica"
                placeholderTextColor={Colors.textMuted}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>{t.schedule}</Text>
              <TextInput
                style={styles.input}
                value={shiftSchedule}
                onChangeText={setShiftSchedule}
                placeholder="Ej. 08:30 - 17:30"
                placeholderTextColor={Colors.textMuted}
              />
            </View>

            <View style={styles.row}>
              <View style={[styles.field, { flex: 1 }]}>
                <Text style={styles.label}>{t.vacationQuota}</Text>
                <TextInput
                  style={styles.input}
                  value={vacationQuota}
                  onChangeText={setVacationQuota}
                  keyboardType="numeric"
                  placeholder="22"
                  placeholderTextColor={Colors.textMuted}
                />
              </View>
              <View style={[styles.field, { flex: 1 }]}>
                <Text style={styles.label}>{t.permitQuota}</Text>
                <TextInput
                  style={styles.input}
                  value={permitQuota}
                  onChangeText={setPermitQuota}
                  keyboardType="numeric"
                  placeholder="32"
                  placeholderTextColor={Colors.textMuted}
                />
              </View>
            </View>

            <TouchableOpacity style={styles.saveBtn} onPress={handleSave} activeOpacity={0.85}>
              <Text style={styles.saveBtnText}>{t.save}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.resetBtn} onPress={handleConfirmReset} activeOpacity={0.8}>
              <Text style={styles.resetBtnText}>{t.resetAll}</Text>
            </TouchableOpacity>
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
    maxHeight: '90%',
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
    paddingHorizontal: 20,
  },
  scrollContent: {
    paddingVertical: 18,
    gap: 14,
  },
  hint: {
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  field: {
    gap: 6,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  langSelectorBtn: {
    height: 48,
    borderWidth: 1,
    borderColor: Colors.accent,
    backgroundColor: Colors.accentMuted,
    borderRadius: 14,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  langLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  flagEmoji: {
    fontSize: 20,
  },
  langNameText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  changeLangText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.accent,
  },
  input: {
    height: 48,
    borderWidth: 1,
    borderColor: Colors.cardBorderSubtle,
    borderRadius: 14,
    paddingHorizontal: 14,
    fontSize: 14,
    color: Colors.textPrimary,
    backgroundColor: Colors.bg,
  },
  saveBtn: {
    height: 50,
    borderRadius: 14,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  saveBtnText: {
    color: Colors.textWhite,
    fontSize: 15,
    fontWeight: '600',
  },
  resetBtn: {
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    marginBottom: 20,
  },
  resetBtnText: {
    color: Colors.danger,
    fontSize: 13,
    fontWeight: '600',
  },
});
