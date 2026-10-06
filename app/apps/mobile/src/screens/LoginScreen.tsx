import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Image } from 'react-native';
import { Colors } from '../theme/colors';
import { useApp } from '../context/AppContext';
import { PasskeyIcon, EditIcon } from '../components/common/Icons';
import { LANGUAGES } from '../i18n';
import { InvitationModal } from '../components/modals/InvitationModal';

interface LoginScreenProps {
  onOpenProfile: () => void;
  onOpenLanguage: () => void;
}

export function LoginScreen({ onOpenProfile, onOpenLanguage }: LoginScreenProps) {
  const { login, user, language, t } = useApp();
  const [isVerifying, setIsVerifying] = useState(false);
  const [inviteModalVisible, setInviteModalVisible] = useState(false);

  const currentLangMeta = LANGUAGES.find((l) => l.code === language) || LANGUAGES[0];

  const handleLogin = () => {
    if (isVerifying) return;
    setIsVerifying(true);
    setTimeout(() => {
      setIsVerifying(false);
      login();
    }, 900);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.topRow}>
          <View style={styles.brand}>
            <Image
              source={require('../../assets/icon.png')}
              style={{ width: 44, height: 44, borderRadius: 12 }}
            />
            <Text style={styles.brandTitle}>Fide</Text>
          </View>

          {/* Language selector in Login */}
          <TouchableOpacity
            style={styles.langPill}
            onPress={onOpenLanguage}
            activeOpacity={0.8}
          >
            <Text style={styles.langFlag}>{currentLangMeta.flag}</Text>
            <Text style={styles.langCode}>{currentLangMeta.code.toUpperCase()}</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.heroTitle}>{t.heroTitle}</Text>
        <Text style={styles.heroSubtitle}>{t.heroSubtitle}</Text>
      </View>

      <View style={styles.footer}>
        <View style={styles.inviteCard}>
          <View style={styles.inviteHeader}>
            <Text style={styles.inviteBadge}>{t.verifiedDevice}</Text>
            <TouchableOpacity onPress={onOpenProfile} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <EditIcon size={16} color={Colors.accentLight} />
            </TouchableOpacity>
          </View>
          <Text style={styles.companyName}>{user.company}</Text>
          <Text style={styles.userName}>
            {user.name} · {user.department}
          </Text>
        </View>

        <TouchableOpacity
          style={styles.loginBtn}
          onPress={handleLogin}
          disabled={isVerifying}
          activeOpacity={0.85}
        >
          {isVerifying ? (
            <ActivityIndicator color={Colors.dark} size="small" />
          ) : (
            <PasskeyIcon size={22} color={Colors.dark} />
          )}
          <Text style={styles.loginBtnText}>
            {isVerifying ? t.verifyingPasskey : t.activatePasskey}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.inviteLinkBtn}
          onPress={() => setInviteModalVisible(true)}
          activeOpacity={0.8}
        >
          <Text style={styles.inviteLinkText}>Hai un QR o link di invito? Attiva qui (1 min) →</Text>
        </TouchableOpacity>

        <Text style={styles.securityNote}>{t.passkeyFootnote}</Text>
      </View>

      <InvitationModal
        visible={inviteModalVisible}
        onClose={() => setInviteModalVisible(false)}
        onEnrolled={() => setInviteModalVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark,
    paddingHorizontal: 28,
    paddingTop: 64,
    paddingBottom: 40,
    justifyContent: 'space-between',
  },
  header: {
    gap: 16,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  brandTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: Colors.textWhite,
    letterSpacing: -0.5,
  },
  langPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.darkCard,
    borderWidth: 1,
    borderColor: Colors.darkBorder,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 18,
  },
  langFlag: {
    fontSize: 16,
  },
  langCode: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.accentLight,
  },
  heroTitle: {
    fontSize: 32,
    fontWeight: '700',
    color: Colors.textWhite,
    lineHeight: 38,
    letterSpacing: -0.8,
    marginTop: 12,
  },
  heroSubtitle: {
    fontSize: 15,
    color: Colors.textLight,
    lineHeight: 22,
  },
  footer: {
    gap: 14,
  },
  inviteCard: {
    backgroundColor: Colors.darkCard,
    borderWidth: 1,
    borderColor: Colors.darkBorder,
    borderRadius: 18,
    padding: 18,
    gap: 6,
  },
  inviteHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  inviteBadge: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    color: Colors.textMuted,
    fontWeight: '600',
  },
  companyName: {
    fontSize: 17,
    fontWeight: '600',
    color: Colors.textWhite,
  },
  userName: {
    fontSize: 14,
    color: Colors.textLight,
  },
  loginBtn: {
    height: 56,
    borderRadius: 16,
    backgroundColor: Colors.accentLight,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  loginBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.dark,
  },
  inviteLinkBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  inviteLinkText: {
    fontSize: 13,
    color: Colors.accentLight,
    fontWeight: '500',
  },
  securityNote: {
    textAlign: 'center',
    fontSize: 13,
    color: Colors.textMuted,
  },
});
