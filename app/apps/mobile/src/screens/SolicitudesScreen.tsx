import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput } from 'react-native';
import { Colors } from '../theme/colors';
import { useApp } from '../context/AppContext';
import { RequestCategory } from '../types';
import { CalendarIcon } from '../components/common/Icons';
import { EmptyState } from '../components/common/EmptyState';

export function SolicitudesScreen() {
  const { user, requests, addRequest, t } = useApp();

  const [selectedType, setSelectedType] = useState<RequestCategory>('vac');
  const [customDetail, setCustomDetail] = useState('');
  const [note, setNote] = useState('');

  const remainingVacation = Math.max(0, user.vacationQuotaDays - user.vacationUsedDays);
  const remainingPermits = Math.max(0, user.permitQuotaHours - user.permitUsedHours);

  const reqDefs: Record<
    RequestCategory,
    { label: string; defaultDetail: string; getImpact: () => string }
  > = {
    vac: {
      label: t.reqVac,
      defaultDetail: `5 ${t.days}`,
      getImpact: () => `${remainingVacation} ${t.days} ${t.reqImpactVac}`,
    },
    per: {
      label: t.reqPer,
      defaultDetail: `2 ${t.hours}`,
      getImpact: () => `${remainingPermits} ${t.hours} ${t.reqImpactPer}`,
    },
    olv: {
      label: t.reqOlv,
      defaultDetail: user.shiftSchedule,
      getImpact: () => t.reqImpactOlv,
    },
    ext: {
      label: t.reqExt,
      defaultDetail: `2 ${t.hours}`,
      getImpact: () => t.reqImpactExt,
    },
  };

  const rd = reqDefs[selectedType];

  const handleSend = () => {
    const detail = customDetail.trim() || rd.defaultDetail;
    const impact = rd.getImpact();
    addRequest(selectedType, detail, impact, note.trim() || undefined);
    setCustomDetail('');
    setNote('');
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Category selector grid */}
      <View style={styles.typesGrid}>
        {(Object.keys(reqDefs) as RequestCategory[]).map((key) => {
          const isSelected = selectedType === key;
          return (
            <TouchableOpacity
              key={key}
              onPress={() => setSelectedType(key)}
              style={[
                styles.typeBtn,
                isSelected && {
                  borderColor: Colors.accent,
                  backgroundColor: Colors.accentMuted,
                },
              ]}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.typeBtnText,
                  isSelected && { color: Colors.accent, fontWeight: '700' },
                ]}
              >
                {reqDefs[key].label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Request Form Box */}
      <View style={styles.formCard}>
        <View style={styles.detailRow}>
          <Text style={styles.detailHeader}>{t.detailSuggested}</Text>
          <TextInput
            style={styles.detailInput}
            value={customDetail}
            onChangeText={setCustomDetail}
            placeholder={rd.defaultDetail}
            placeholderTextColor={Colors.textMuted}
          />
        </View>

        <Text style={styles.impactText}>{rd.getImpact()}</Text>

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>{t.noteForManager}</Text>
          <TextInput
            style={styles.textArea}
            value={note}
            onChangeText={setNote}
            placeholder="..."
            placeholderTextColor={Colors.textMuted}
            multiline
            numberOfLines={2}
          />
        </View>

        <TouchableOpacity style={styles.sendBtn} onPress={handleSend} activeOpacity={0.85}>
          <Text style={styles.sendBtnText}>{t.sendRequest}</Text>
        </TouchableOpacity>
      </View>

      {/* Request History */}
      <View style={styles.historySection}>
        <Text style={styles.sectionTitle}>{t.requestHistory}</Text>

        {requests.length === 0 ? (
          <EmptyState
            icon={<CalendarIcon size={24} color={Colors.accent} />}
            title={t.noRequests}
            description={t.noRequestsDesc}
          />
        ) : (
          requests.map((req) => {
            const isPending = req.status === 'Pendiente';
            const isApproved = req.status === 'Aprobada';
            return (
              <View key={req.id} style={styles.historyCard}>
                <View style={styles.historyInfo}>
                  <Text style={styles.historyType}>{req.categoryLabel}</Text>
                  <Text style={styles.historyDetail}>{req.detail}</Text>
                  {req.note && <Text style={styles.historyNote}>"{req.note}"</Text>}
                </View>

                <View
                  style={[
                    styles.statusBadge,
                    {
                      backgroundColor: isPending
                        ? Colors.warningBg
                        : isApproved
                        ? Colors.successBg
                        : Colors.dangerBg,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.statusBadgeText,
                      {
                        color: isPending
                          ? Colors.warningText
                          : isApproved
                          ? Colors.success
                          : Colors.danger,
                      },
                    ]}
                  >
                    {isPending ? t.statusPending : isApproved ? t.statusApproved : t.statusRejected}
                  </Text>
                </View>
              </View>
            );
          })
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 24,
    gap: 16,
  },
  typesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  typeBtn: {
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
  typeBtnText: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.textPrimary,
  },
  formCard: {
    backgroundColor: Colors.cardBg,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    borderRadius: 18,
    padding: 16,
    gap: 12,
  },
  detailRow: {
    gap: 6,
  },
  detailHeader: {
    fontSize: 12,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontWeight: '600',
  },
  detailInput: {
    borderWidth: 1,
    borderColor: Colors.cardBorderSubtle,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textPrimary,
    backgroundColor: Colors.bg,
  },
  impactText: {
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  field: {
    gap: 6,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: Colors.textPrimary,
  },
  textArea: {
    borderWidth: 1,
    borderColor: Colors.cardBorderSubtle,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: Colors.textPrimary,
    backgroundColor: Colors.bg,
    height: 60,
    textAlignVertical: 'top',
  },
  sendBtn: {
    height: 48,
    borderRadius: 14,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  sendBtnText: {
    color: Colors.textWhite,
    fontWeight: '600',
    fontSize: 15,
  },
  historySection: {
    gap: 10,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  historyCard: {
    backgroundColor: Colors.cardBg,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  historyInfo: {
    flex: 1,
    gap: 2,
  },
  historyType: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  historyDetail: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  historyNote: {
    fontSize: 12,
    color: Colors.textMuted,
    fontStyle: 'italic',
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
});
