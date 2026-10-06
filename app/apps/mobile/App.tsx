import React, { useState } from 'react';
import { View, StyleSheet, SafeAreaView, Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import {
  SpaceGrotesk_500Medium,
  SpaceGrotesk_700Bold,
} from '@expo-google-fonts/space-grotesk';
import {
  IBMPlexSans_400Regular,
  IBMPlexSans_500Medium,
  IBMPlexSans_600SemiBold,
} from '@expo-google-fonts/ibm-plex-sans';
import {
  IBMPlexMono_400Regular,
  IBMPlexMono_500Medium,
} from '@expo-google-fonts/ibm-plex-mono';

import { AppProvider, useApp } from './src/context/AppContext';
import { Colors } from './src/theme/colors';
import { RequestCategory } from './src/types';

import { Header } from './src/components/common/Header';
import { BottomNav } from './src/components/common/BottomNav';
import { Toast } from './src/components/common/Toast';
import { ProfileModal } from './src/components/modals/ProfileModal';
import { NewRequestModal } from './src/components/modals/NewRequestModal';
import { LanguageSelectorModal } from './src/components/modals/LanguageSelectorModal';
import { DiagnosticsModal } from './src/components/modals/DiagnosticsModal';

import { LoginScreen } from './src/screens/LoginScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { FicharScreen } from './src/screens/FicharScreen';
import { SolicitudesScreen } from './src/screens/SolicitudesScreen';
import { DocsScreen } from './src/screens/DocsScreen';
import { AsistenteScreen } from './src/screens/AsistenteScreen';
import { PrivacidadScreen } from './src/screens/PrivacidadScreen';

function MainApp() {
  const {
    isLoggedIn,
    currentScreen,
    toast,
    user,
    updateUser,
    resetAllData,
    addRequest,
    language,
    setLanguage,
  } = useApp();

  const [profileModalVisible, setProfileModalVisible] = useState(false);
  const [languageModalVisible, setLanguageModalVisible] = useState(false);
  const [newRequestModalVisible, setNewRequestModalVisible] = useState(false);
  const [diagnosticsVisible, setDiagnosticsVisible] = useState(false);
  const [initialCategory, setInitialCategory] = useState<RequestCategory>('vac');

  const remainingVacation = Math.max(0, user.vacationQuotaDays - user.vacationUsedDays);
  const remainingPermits = Math.max(0, user.permitQuotaHours - user.permitUsedHours);

  const handleOpenNewRequest = (cat?: RequestCategory) => {
    if (cat) setInitialCategory(cat);
    setNewRequestModalVisible(true);
  };

  if (!isLoggedIn) {
    return (
      <View style={styles.root}>
        <StatusBar style="light" />
        <LoginScreen
          onOpenProfile={() => setProfileModalVisible(true)}
          onOpenLanguage={() => setLanguageModalVisible(true)}
        />
        <ProfileModal
          visible={profileModalVisible}
          user={user}
          onClose={() => setProfileModalVisible(false)}
          onSave={updateUser}
          onResetData={resetAllData}
          onOpenLanguage={() => setLanguageModalVisible(true)}
        />
        <LanguageSelectorModal
          visible={languageModalVisible}
          currentLanguage={language}
          onClose={() => setLanguageModalVisible(false)}
          onSelectLanguage={(lang) => setLanguage(lang)}
        />
        <Toast message={toast} />
      </View>
    );
  }

  const renderScreen = () => {
    switch (currentScreen) {
      case 'home':
        return <HomeScreen onOpenNewRequest={() => handleOpenNewRequest('vac')} />;
      case 'fichar':
        return <FicharScreen />;
      case 'solicitudes':
        return <SolicitudesScreen />;
      case 'docs':
        return <DocsScreen />;
      case 'asistente':
        return <AsistenteScreen onOpenNewRequest={handleOpenNewRequest} />;
      case 'privacidad':
        return <PrivacidadScreen />;
      default:
        return <HomeScreen onOpenNewRequest={() => handleOpenNewRequest('vac')} />;
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <View style={styles.container}>
        <Header
          onOpenProfile={() => setProfileModalVisible(true)}
          onOpenLanguage={() => setLanguageModalVisible(true)}
          onOpenDiagnostics={() => setDiagnosticsVisible(true)}
        />

        <View style={styles.screenContainer}>{renderScreen()}</View>

        <BottomNav />

        {/* Global Modals */}
        <ProfileModal
          visible={profileModalVisible}
          user={user}
          onClose={() => setProfileModalVisible(false)}
          onSave={updateUser}
          onResetData={resetAllData}
          onOpenLanguage={() => setLanguageModalVisible(true)}
        />

        <LanguageSelectorModal
          visible={languageModalVisible}
          currentLanguage={language}
          onClose={() => setLanguageModalVisible(false)}
          onSelectLanguage={(lang) => setLanguage(lang)}
        />

        <NewRequestModal
          visible={newRequestModalVisible}
          initialCategory={initialCategory}
          vacationRemaining={remainingVacation}
          permitRemaining={remainingPermits}
          onClose={() => setNewRequestModalVisible(false)}
          onSubmit={({ category, detail, impact, note }) => {
            addRequest(category, detail, impact, note);
          }}
        />

        <DiagnosticsModal visible={diagnosticsVisible} onClose={() => setDiagnosticsVisible(false)} />

        <Toast message={toast} />
      </View>
    </SafeAreaView>
  );
}

export default function App() {
  const [fontsLoaded] = useFonts({
    SpaceGrotesk_500Medium,
    SpaceGrotesk_700Bold,
    IBMPlexSans_400Regular,
    IBMPlexSans_500Medium,
    IBMPlexSans_600SemiBold,
    IBMPlexMono_400Regular,
    IBMPlexMono_500Medium,
  });

  return (
    <SafeAreaProvider>
      <AppProvider>
        <MainApp />
      </AppProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.dark,
  },
  safeArea: {
    flex: 1,
    backgroundColor: Colors.bg,
    paddingTop: Platform.OS === 'android' ? 24 : 0,
  },
  container: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  screenContainer: {
    flex: 1,
  },
});
