import React, { useState } from 'react';
import { View, Text, StyleSheet, Modal, TextInput, TouchableOpacity, ScrollView } from 'react-native';
import { Colors } from '../../theme/colors';
import { RequestCategory } from '../../types';
import { CloseIcon } from '../common/Icons';
import { useApp } from '../../context/AppContext';

interface NewRequestModalProps {
  visible: boolean;
  initialCategory?: RequestCategory;
  vacationRemaining: number;
  permitRemaining: number;
  onClose: () => void;
  onSubmit: (data: { category: RequestCategory; detail: string; impact: string; note?: string }) => void;
}

export function NewRequestModal({
  visible,
  initialCategory = 'vac',
  vacationRemaining,
  permitRemaining,
  onClose,
  onSubmit,
}: NewRequestModalProps) {
  const { t } = useApp();

  const [category, setCategory] = useState<RequestCategory>(initialCategory);
  const [detailInput, setDetailInput] = useState('');
  const [noteInput, setNoteInput] = useState('');

  const categories: { key: RequestCategory; label: string; placeholder: string }[] = [
    { key: 'vac', label: t.reqVac, placeholder: `5 ${t.days}` },
    { key: 'per', label: t.reqPer, placeholder: `2 ${t.hours}` },
    { key: 'olv', label: t.reqOlv, placeholder: '08:30 - 17:30' },
    { key: 'ext', label: t.reqExt, placeholder: `1.5 ${t.hours}` },
  ];

  const currentCategory = categories.find((c) => c.key === category) || categories[0];

  const getImpactDescription = () => {
    switch (category) {
      case 'vac':
        return `${vacationRemaining} ${t.days} ${t.reqImpactVac}`;
      case 'per':
        return `${permitRemaining} ${t.hours} ${t.reqImpactPer}`;
      case 'olv':
        return t.reqImpactOlv;
      case 'ext':
        return t.reqImpactExt;
    }
  };

  const handleSubmit = () => {
    const detail = detailInput.trim() || currentCategory.label;
    onSubmit({
      category,
      detail,
      impact: getImpactDescription(),
      note: noteInput.trim() || undefined,
    });
    setDetailInput('');
    setNoteInput('');
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View>
              <Text style={styles.subtitle}>{t.newRequestModalSubtitle}</Text>
              <Text style={styles.title}>{t.newRequestModalTitle}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <CloseIcon size={20} color={Colors.textPrimary} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.content}>
            {/* Category selector */}
            <Text style={styles.label}>{t.requestsSubtitle}</Text>
            <View style={styles.categoryGrid}>
              {categories.map((c) => {
                const isSelected = category === c.key;
                return (
                  <TouchableOpacity
                    key={c.key}
                    onPress={() => setCategory(c.key)}
                    style={[
                      styles.categoryBtn,
                      isSelected && {
                        borderColor: Colors.accent,
                        backgroundColor: Colors.accentMuted,
                      },
                    ]}
                    activeOpacity={0.8}
                  >
                    <Text
                      style={[
                        styles.categoryBtnText,
                        isSelected && { color: Colors.accent, fontWeight: '700' },
                      ]}
                    >
                      {c.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Detail input */}
            <View style={styles.field}>
              <Text style={styles.label}>{t.detailSuggested}</Text>
              <TextInput
                style={styles.input}
                value={detailInput}
                onChangeText={setDetailInput}
                placeholder={currentCategory.placeholder}
                placeholderTextColor={Colors.textMuted}
              />
            </View>

            {/* Impact info */}
            <View style={styles.impactBox}>
              <Text style={styles.impactText}>{getImpactDescription()}</Text>
            </View>

            {/* Optional note */}
            <View style={styles.field}>
              <Text style={styles.label}>{t.noteForManager}</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={noteInput}
                onChangeText={setNoteInput}
                placeholder="..."
                placeholderTextColor={Colors.textMuted}
                multiline
                numberOfLines={3}
              />
            </View>

            <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit} activeOpacity={0.85}>
              <Text style={styles.submitBtnText}>{t.sendRequest}</Text>
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
  content: {
    padding: 20,
    gap: 16,
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryBtn: {
    flexBasis: '48%',
    flexGrow: 1,
    height: 48,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: Colors.cardBorderSubtle,
    backgroundColor: Colors.cardBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryBtnText: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.textPrimary,
  },
  field: {
    gap: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  input: {
    borderWidth: 1,
    borderColor: Colors.cardBorderSubtle,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: Colors.textPrimary,
    backgroundColor: Colors.bg,
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  impactBox: {
    backgroundColor: Colors.accentMuted,
    borderRadius: 14,
    padding: 12,
  },
  impactText: {
    fontSize: 13,
    color: Colors.accentHover,
    lineHeight: 18,
  },
  submitBtn: {
    height: 50,
    borderRadius: 14,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
    marginBottom: 20,
  },
  submitBtnText: {
    color: Colors.textWhite,
    fontSize: 15,
    fontWeight: '600',
  },
});
