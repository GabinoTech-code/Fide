import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Colors } from '../theme/colors';
import { useApp } from '../context/AppContext';
import { VerificationMethod, MethodDefinition } from '../types';
import { ShieldPrivacyIcon } from '../components/common/Icons';
import { VerificationActionModal } from '../components/modals/VerificationActionModal';

export function FicharScreen() {
  const {
    clockedIn,
    elapsedFormatted,
    selectedMethod,
    setSelectedMethod,
    offlineMode,
    toggleOffline,
    recordPunch,
    punches,
    t,
  } = useApp();

  const [verifyModalVisible, setVerifyModalVisible] = useState(false);

  const methods: MethodDefinition[] = [
    {
      key: 'geo',
      label: t.methodGeo,
      info: t.methodGeoInfo,
    },
    {
      key: 'qr',
      label: t.methodQr,
      info: t.methodQrInfo,
    },
    {
      key: 'nfc',
      label: t.methodNfc,
      info: t.methodNfcInfo,
    },
  ];

  const currentMethod = methods.find((m) => m.key === selectedMethod) || methods[0];

  const todayStr = new Date().toDateString();
  const todayPunches = punches.filter(
    (p) => new Date(p.timestamp).toDateString() === todayStr
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Clock Counter & Big Circular Button */}
      <View style={styles.clockSection}>
        <Text style={styles.elapsedDisplay}>{elapsedFormatted}</Text>

        <TouchableOpacity
          style={[
            styles.clockCircle,
            {
              backgroundColor: clockedIn ? Colors.dark : Colors.accent,
              borderColor: clockedIn ? Colors.cardBorderSubtle : Colors.accentRing,
            },
          ]}
          onPress={recordPunch}
          activeOpacity={0.85}
        >
          <Text style={styles.clockCircleLabel}>{clockedIn ? t.btnClockOut : t.btnClockIn}</Text>
          <Text style={styles.clockCircleSub}>{currentMethod.label}</Text>
        </TouchableOpacity>
      </View>

      {/* Verification method selection */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t.verificationMethod}</Text>
        <View style={styles.methodsRow}>
          {methods.map((m) => {
            const isSelected = selectedMethod === m.key;
            return (
              <TouchableOpacity
                key={m.key}
                onPress={() => setSelectedMethod(m.key)}
                style={[
                  styles.methodBtn,
                  isSelected && {
                    borderColor: Colors.accent,
                    backgroundColor: Colors.accentMuted,
                  },
                ]}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.methodBtnText,
                    isSelected && { color: Colors.accent, fontWeight: '700' },
                  ]}
                >
                  {m.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Security / Privacy explanation callout with interactive verification */}
        <TouchableOpacity
          style={styles.infoCallout}
          onPress={() => setVerifyModalVisible(true)}
          activeOpacity={0.8}
        >
          <ShieldPrivacyIcon size={18} color={Colors.accent} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.infoCalloutText}>{currentMethod.info}</Text>
            <Text style={styles.infoCalloutTap}>Tocca per simulare/verificare {currentMethod.label} →</Text>
          </View>
        </TouchableOpacity>
      </View>

      <VerificationActionModal
        visible={verifyModalVisible}
        method={selectedMethod}
        onClose={() => setVerifyModalVisible(false)}
        onConfirm={recordPunch}
      />

      {/* Offline Mode Switch */}
      <View style={styles.offlineBox}>
        <View style={styles.offlineTextWrap}>
          <Text style={styles.offlineTitle}>{t.offlineMode}</Text>
          <Text style={styles.offlineSub}>{t.offlineModeDesc}</Text>
        </View>
        <TouchableOpacity
          style={[
            styles.toggleTrack,
            { backgroundColor: offlineMode ? Colors.warning : Colors.toggleTrackInactive },
          ]}
          onPress={toggleOffline}
          activeOpacity={0.85}
        >
          <View
            style={[
              styles.toggleKnob,
              { transform: [{ translateX: offlineMode ? 20 : 0 }] },
            ]}
          />
        </TouchableOpacity>
      </View>

      {/* Today's Punches */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t.today}</Text>
        {todayPunches.length === 0 ? (
          <View style={styles.emptyPunchesBox}>
            <Text style={styles.emptyPunchesText}>{t.noPunchesToday}</Text>
          </View>
        ) : (
          todayPunches.map((punch) => {
            const isQueued = punch.queued;
            return (
              <View key={punch.id} style={styles.punchItem}>
                <View style={styles.punchInfo}>
                  <Text style={styles.punchTitle}>
                    {punch.type === 'Entrada' ? t.btnClockIn : t.btnClockOut} · {punch.method}
                  </Text>
                  <Text
                    style={[
                      styles.punchStatus,
                      { color: isQueued ? Colors.warningText : Colors.success },
                    ]}
                  >
                    {punch.status}
                  </Text>
                </View>
                <Text style={styles.punchTime}>{punch.timeFormatted}</Text>
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
    gap: 18,
  },
  clockSection: {
    alignItems: 'center',
    gap: 14,
    paddingVertical: 8,
  },
  elapsedDisplay: {
    fontSize: 34,
    fontWeight: '500',
    color: Colors.textPrimary,
    letterSpacing: -0.5,
  },
  clockCircle: {
    width: 168,
    height: 168,
    borderRadius: 84,
    borderWidth: 10,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  clockCircleLabel: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.textWhite,
  },
  clockCircleSub: {
    fontSize: 12,
    fontWeight: '400',
    color: Colors.textWhite,
    opacity: 0.85,
  },
  section: {
    gap: 10,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  methodsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  methodBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.cardBorderSubtle,
    backgroundColor: Colors.cardBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  methodBtnText: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.textPrimary,
  },
  infoCallout: {
    backgroundColor: Colors.accentMuted,
    borderRadius: 14,
    padding: 12,
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },
  infoCalloutText: {
    fontSize: 13,
    lineHeight: 18,
    color: '#13372B',
  },
  infoCalloutTap: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.accent,
    marginTop: 2,
  },
  offlineBox: {
    backgroundColor: Colors.cardBg,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  offlineTextWrap: {
    gap: 2,
  },
  offlineTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  offlineSub: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  toggleTrack: {
    width: 52,
    height: 32,
    borderRadius: 16,
    padding: 3,
    justifyContent: 'center',
  },
  toggleKnob: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: Colors.cardBg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 3,
  },
  emptyPunchesBox: {
    backgroundColor: Colors.cardBg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    padding: 16,
    alignItems: 'center',
  },
  emptyPunchesText: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  punchItem: {
    backgroundColor: Colors.cardBg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    padding: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  punchInfo: {
    gap: 2,
  },
  punchTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  punchStatus: {
    fontSize: 12,
  },
  punchTime: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
});
