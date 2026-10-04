import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Colors } from '../theme/colors';
import { useApp } from '../context/AppContext';
import {
  CalendarIcon,
  ReceiptIcon,
  ShiftSwapIcon,
  SparklesIcon,
  LockIcon,
  BellIcon,
} from '../components/common/Icons';
import { PushService, EncryptedPushPayload } from '../services/pushService';
import { EncryptedPushModal } from '../components/modals/EncryptedPushModal';

interface HomeScreenProps {
  onOpenNewRequest: () => void;
}

export function HomeScreen({ onOpenNewRequest }: HomeScreenProps) {
  const {
    clockedIn,
    elapsedFormatted,
    offlineMode,
    setCurrentScreen,
    user,
    notices,
    dismissNotice,
    showToast,
    t,
  } = useApp();

  const [pushModalData, setPushModalData] = useState<EncryptedPushPayload | null>(null);

  const handleSimulatePush = () => {
    const payload = PushService.simulateEncryptedPush();
    setPushModalData(payload);
  };

  const remainingVacation = Math.max(0, user.vacationQuotaDays - user.vacationUsedDays);
  const remainingPermits = Math.max(0, user.permitQuotaHours - user.permitUsedHours);

  const statusText = clockedIn
    ? t.statusClockedIn
    : `${t.statusClockedOutPrefix} ${user.shiftSchedule} · ${t.statusClockedOutSuffix}`;

  const statusPill = offlineMode ? t.offline : t.online;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Shift & Clock status card */}
      <View style={styles.statusCard}>
        <View style={styles.statusRow}>
          <Text style={styles.statusText}>{statusText}</Text>
          <View style={[styles.pill, offlineMode && { backgroundColor: Colors.warningBg }]}>
            <Text style={[styles.pillText, offlineMode && { color: Colors.warningText }]}>
              {statusPill}
            </Text>
          </View>
        </View>

        <Text style={styles.elapsedTimer}>{elapsedFormatted}</Text>

        <TouchableOpacity
          style={styles.clockCta}
          onPress={() => setCurrentScreen('fichar')}
          activeOpacity={0.85}
        >
          <Text style={styles.clockCtaText}>
            {clockedIn ? t.btnClockOut : t.btnClockIn}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Dynamic Balances Grid */}
      <View style={styles.balanceGrid}>
        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>{t.vacation}</Text>
          <Text style={styles.balanceValue}>
            {remainingVacation}{' '}
            <Text style={styles.balanceUnit}>{t.days}</Text>
          </Text>
        </View>

        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>{t.permits}</Text>
          <Text style={styles.balanceValue}>
            {remainingPermits}{' '}
            <Text style={styles.balanceUnit}>{t.hours}</Text>
          </Text>
        </View>
      </View>

      {/* Quick Actions (4-column grid) */}
      <View style={styles.actionsGrid}>
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={onOpenNewRequest}
          activeOpacity={0.7}
        >
          <View style={styles.actionIconContainer}>
            <CalendarIcon size={22} color={Colors.accent} />
          </View>
          <Text style={styles.actionLabel}>{t.actionAbsence}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => showToast(t.actionExpense)}
          activeOpacity={0.7}
        >
          <View style={styles.actionIconContainer}>
            <ReceiptIcon size={22} color={Colors.accent} />
          </View>
          <Text style={styles.actionLabel}>{t.actionExpense}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => showToast(t.actionShifts)}
          activeOpacity={0.7}
        >
          <View style={styles.actionIconContainer}>
            <ShiftSwapIcon size={22} color={Colors.accent} />
          </View>
          <Text style={styles.actionLabel}>{t.actionShifts}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => setCurrentScreen('asistente')}
          activeOpacity={0.7}
        >
          <View style={styles.actionIconContainer}>
            <SparklesIcon size={22} color={Colors.accent} />
          </View>
          <Text style={styles.actionLabel}>{t.actionAssistant}</Text>
        </TouchableOpacity>
      </View>

      {/* Notices Section */}
      <View style={styles.noticesSection}>
        <Text style={styles.sectionTitle}>{t.notices}</Text>

        {notices.length === 0 ? (
          <View style={styles.emptyNoticeCard}>
            <Text style={styles.emptyNoticeText}>{t.noNotices}</Text>
          </View>
        ) : (
          notices.map((notice) => {
            const isDoc = notice.type === 'doc';
            return (
              <TouchableOpacity
                key={notice.id}
                style={styles.noticeCard}
                onPress={() => {
                  if (isDoc) {
                    handleSimulatePush();
                  } else if (notice.actionScreen) {
                    setCurrentScreen(notice.actionScreen);
                  }
                }}
                activeOpacity={0.7}
              >
                <View
                  style={[
                    styles.noticeIconWrap,
                    {
                      backgroundColor: isDoc ? Colors.accentMuted : Colors.warningBg,
                    },
                  ]}
                >
                  {isDoc ? (
                    <LockIcon size={20} color={Colors.accent} />
                  ) : (
                    <BellIcon size={20} color={Colors.warningText} />
                  )}
                </View>
                <View style={styles.noticeBody}>
                  <Text style={styles.noticeTitle}>{notice.title}</Text>
                  <Text style={styles.noticeSubtitle}>{notice.subtitle}</Text>
                </View>
                <TouchableOpacity
                  onPress={() => dismissNotice(notice.id)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.dismissNotice}>✕</Text>
                </TouchableOpacity>
              </TouchableOpacity>
            );
          })
        )}

        <TouchableOpacity
          style={styles.simPushBtn}
          onPress={handleSimulatePush}
          activeOpacity={0.8}
        >
          <LockIcon size={16} color={Colors.accent} />
          <Text style={styles.simPushText}>Verifica Push E2EE: vedi cosa vedono Apple/Google</Text>
        </TouchableOpacity>
      </View>

      <EncryptedPushModal
        visible={!!pushModalData}
        pushData={pushModalData}
        onClose={() => setPushModalData(null)}
        onNavigateToDocs={() => {
          setPushModalData(null);
          setCurrentScreen('docs');
        }}
      />
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
    paddingTop: 4,
    paddingBottom: 24,
    gap: 16,
  },
  statusCard: {
    backgroundColor: Colors.dark,
    borderRadius: 22,
    padding: 20,
    gap: 14,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusText: {
    fontSize: 13,
    color: Colors.textLight,
  },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: Colors.darkPill,
  },
  pillText: {
    fontSize: 12,
    color: Colors.accentLight,
    fontWeight: '500',
  },
  elapsedTimer: {
    fontSize: 38,
    fontWeight: '500',
    color: Colors.textWhite,
    letterSpacing: -1,
  },
  clockCta: {
    height: 48,
    borderRadius: 14,
    backgroundColor: Colors.accentLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clockCtaText: {
    color: Colors.dark,
    fontWeight: '600',
    fontSize: 15,
  },
  balanceGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  balanceCard: {
    flex: 1,
    backgroundColor: Colors.cardBg,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    gap: 4,
  },
  balanceLabel: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  balanceValue: {
    fontSize: 26,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  balanceUnit: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.textSecondary,
  },
  actionsGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  actionBtn: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
  },
  actionIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: Colors.cardBg,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: {
    fontSize: 12,
    color: Colors.textPrimary,
    fontWeight: '500',
  },
  noticesSection: {
    gap: 10,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  noticeCard: {
    backgroundColor: Colors.cardBg,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  noticeIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  noticeBody: {
    flex: 1,
    gap: 2,
  },
  noticeTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  noticeSubtitle: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  dismissNotice: {
    fontSize: 14,
    color: Colors.textSecondary,
    paddingHorizontal: 4,
  },
  emptyNoticeCard: {
    backgroundColor: Colors.cardBg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    padding: 16,
    alignItems: 'center',
  },
  emptyNoticeText: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  simPushBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.accentMuted,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    marginTop: 4,
  },
  simPushText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.accentHover,
  },
});
