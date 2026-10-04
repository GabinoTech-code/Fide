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

  const [viewMode, setViewMode] = useState<'employee' | 'manager'>('employee');
  const [pushModalData, setPushModalData] = useState<EncryptedPushPayload | null>(null);
  const [inviteModalVisible, setInviteModalVisible] = useState(false);
  const [pendingApprovals, setPendingApprovals] = useState([
    { id: 'app-1', name: 'Marco Rossi', type: 'Ferie (3 giorni)', date: '12 - 14 Ottobre', status: 'pending' },
    { id: 'app-2', name: 'Sofia Ramos', type: 'Permesso Visita (2h)', date: 'Oggi 15:30', status: 'pending' },
  ]);

  const handleApprove = (id: string, name: string) => {
    setPendingApprovals(prev => prev.filter(a => a.id !== id));
    showToast(`Richiesta di ${name} approvata con firma crittografica`);
  };

  const handleReject = (id: string, name: string) => {
    setPendingApprovals(prev => prev.filter(a => a.id !== id));
    showToast(`Richiesta di ${name} respinta`);
  };

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
      {/* Role / Mode Switcher */}
      <View style={styles.segmentContainer}>
        <TouchableOpacity
          style={[styles.segmentBtn, viewMode === 'employee' && styles.segmentBtnActive]}
          onPress={() => setViewMode('employee')}
          activeOpacity={0.8}
        >
          <Text style={[styles.segmentText, viewMode === 'employee' && styles.segmentTextActive]}>
            👤 Mi Jornada
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.segmentBtn, viewMode === 'manager' && styles.segmentBtnActive]}
          onPress={() => setViewMode('manager')}
          activeOpacity={0.8}
        >
          <Text style={[styles.segmentText, viewMode === 'manager' && styles.segmentTextActive]}>
            🏢 Panel Responsable
          </Text>
        </TouchableOpacity>
      </View>

      {viewMode === 'manager' ? (
        /* ==================== MANAGER DASHBOARD ==================== */
        <View style={styles.managerContainer}>
          {/* Site & Geofence Status */}
          <View style={styles.statusCard}>
            <View style={styles.statusRow}>
              <Text style={styles.statusText}>Sede: Officine Aurora HQ</Text>
              <View style={[styles.pill, { backgroundColor: Colors.accentMuted }]}>
                <Text style={[styles.pillText, { color: Colors.accent }]}>Geovalla 150m</Text>
              </View>
            </View>
            <Text style={styles.managerSubHeader}>Presenze In Tempo Reale</Text>
            <View style={styles.managerKpiRow}>
              <View style={styles.kpiMiniCard}>
                <Text style={styles.kpiMiniNum}>4</Text>
                <Text style={styles.kpiMiniLabel}>In Turno</Text>
              </View>
              <View style={styles.kpiMiniCard}>
                <Text style={styles.kpiMiniNum}>1</Text>
                <Text style={styles.kpiMiniLabel}>Pausa/Uscita</Text>
              </View>
              <View style={styles.kpiMiniCard}>
                <Text style={[styles.kpiMiniNum, { color: Colors.accentLight }]}>100%</Text>
                <Text style={styles.kpiMiniLabel}>Firme Valide</Text>
              </View>
            </View>
          </View>

          {/* Quick Team Invite Button */}
          <TouchableOpacity
            style={styles.inviteBannerBtn}
            onPress={() => {
              showToast('Enlace de invitación generado: fide://invite?code=AURORA-2026');
            }}
            activeOpacity={0.85}
          >
            <Text style={styles.inviteBannerText}>➕ Invitar Nuevo Empleado (Enlace Rápido)</Text>
          </TouchableOpacity>

          {/* Live Team Presence List */}
          <View style={styles.noticesSection}>
            <Text style={styles.sectionTitle}>Estado de Presencia del Equipo</Text>
            
            <View style={styles.teamMemberCard}>
              <View style={styles.teamMemberDot} />
              <View style={styles.teamMemberInfo}>
                <Text style={styles.teamMemberName}>Marco Rossi</Text>
                <Text style={styles.teamMemberRole}>Logística · Entrada 08:28 · Geovalla RAM OK</Text>
              </View>
              <Text style={styles.badgePresent}>Presente</Text>
            </View>

            <View style={styles.teamMemberCard}>
              <View style={styles.teamMemberDot} />
              <View style={styles.teamMemberInfo}>
                <Text style={styles.teamMemberName}>Elena Conti</Text>
                <Text style={styles.teamMemberRole}>Administración · Entrada 08:31 · QR Kiosk</Text>
              </View>
              <Text style={styles.badgePresent}>Presente</Text>
            </View>

            <View style={styles.teamMemberCard}>
              <View style={styles.teamMemberDot} />
              <View style={styles.teamMemberInfo}>
                <Text style={styles.teamMemberName}>Ion Popescu</Text>
                <Text style={styles.teamMemberRole}>Magazzino · Entrada 08:20 · Tag NFC</Text>
              </View>
              <Text style={styles.badgePresent}>Presente</Text>
            </View>

            <View style={[styles.teamMemberCard, { opacity: 0.7 }]}>
              <View style={[styles.teamMemberDot, { backgroundColor: Colors.warning }]} />
              <View style={styles.teamMemberInfo}>
                <Text style={styles.teamMemberName}>Sofia Ramos</Text>
                <Text style={styles.teamMemberRole}>Qualità · Turno Tarde (14:00 - 22:00)</Text>
              </View>
              <Text style={[styles.badgePresent, { color: Colors.warning, borderColor: Colors.warning }]}>Pendiente</Text>
            </View>
          </View>

          {/* Pending Approvals */}
          <View style={[styles.noticesSection, { marginTop: 14 }]}>
            <Text style={styles.sectionTitle}>Solicitudes Pendientes de Validación</Text>
            {pendingApprovals.length === 0 ? (
              <View style={styles.emptyNoticeCard}>
                <Text style={styles.emptyNoticeText}>No hay solicitudes pendientes</Text>
              </View>
            ) : (
              pendingApprovals.map((req) => (
                <View key={req.id} style={styles.approvalCard}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.approvalName}>{req.name}</Text>
                    <Text style={styles.approvalType}>{req.type} · {req.date}</Text>
                  </View>
                  <View style={styles.approvalActions}>
                    <TouchableOpacity
                      style={styles.approveBtn}
                      onPress={() => handleApprove(req.id, req.name)}
                    >
                      <Text style={styles.approveBtnText}>Aprobar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.rejectBtn}
                      onPress={() => handleReject(req.id, req.name)}
                    >
                      <Text style={styles.rejectBtnText}>Rechazar</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </View>
        </View>
      ) : (
        /* ==================== EMPLOYEE VIEW ==================== */
        <>
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
      </>
      )}

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
  segmentContainer: {
    flexDirection: 'row',
    backgroundColor: Colors.cardBg,
    borderRadius: 14,
    padding: 4,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 10,
  },
  segmentBtnActive: {
    backgroundColor: Colors.accent,
  },
  segmentText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  segmentTextActive: {
    color: Colors.textWhite,
  },
  managerContainer: {
    gap: 16,
  },
  managerSubHeader: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textLight,
  },
  managerKpiRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  kpiMiniCard: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 14,
    padding: 12,
    alignItems: 'center',
    gap: 2,
  },
  kpiMiniNum: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.textWhite,
  },
  kpiMiniLabel: {
    fontSize: 11,
    color: Colors.textLight,
    fontWeight: '500',
  },
  inviteBannerBtn: {
    backgroundColor: Colors.accentMuted,
    borderWidth: 1.5,
    borderColor: Colors.accentLight,
    borderStyle: 'dashed',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  inviteBannerText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.accent,
  },
  teamMemberCard: {
    backgroundColor: Colors.cardBg,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    borderRadius: 14,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  teamMemberDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.accentLight,
  },
  teamMemberInfo: {
    flex: 1,
  },
  teamMemberName: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  teamMemberRole: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  badgePresent: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.accent,
    borderWidth: 1,
    borderColor: Colors.accentLight,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  approvalCard: {
    backgroundColor: Colors.cardBg,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  approvalName: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  approvalType: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  approvalActions: {
    flexDirection: 'row',
    gap: 8,
  },
  approveBtn: {
    backgroundColor: Colors.accent,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  approveBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textWhite,
  },
  rejectBtn: {
    backgroundColor: '#FBEBEB',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  rejectBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#D94841',
  },
});
