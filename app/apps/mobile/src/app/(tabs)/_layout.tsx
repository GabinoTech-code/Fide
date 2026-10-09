import { Redirect, Tabs } from 'expo-router';
import { useT } from '../../i18n/app';
import { useRealtimeRefresh } from '../../lib/refresh';
import { useSession } from '../../lib/session';
import { BrandIcon } from '../../components/common/Icons';
import { Colors } from '../../theme/colors';
import { Fonts } from '../../ui/kit';

export default function TabsLayout() {
  const { t } = useT();
  const { session, membership, keyState } = useSession();
  useRealtimeRefresh(membership?.id);
  if (!session || !membership || keyState === 'missing' || keyState === 'replaced') return <Redirect href="/" />;
  // Former employees keep documents and privacy only: no punching, no requests.
  const hidden = membership.status === 'terminated' ? { href: null } : {};

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Colors.accent,
        tabBarInactiveTintColor: Colors.tabInactive,
        tabBarStyle: { backgroundColor: Colors.cardBg, borderTopColor: Colors.cardBorder, borderTopWidth: 1, paddingTop: 6 },
        tabBarLabelStyle: { fontFamily: Fonts.textMedium, fontSize: 11 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: t('tabs.home'), tabBarIcon: ({ color }) => <BrandIcon name="inicio" size={22} color={color} /> }} />
      <Tabs.Screen name="timbra" options={{ ...hidden, title: t('tabs.punch'), tabBarIcon: ({ color }) => <BrandIcon name="fichar" size={22} color={color} /> }} />
      <Tabs.Screen name="richieste" options={{ ...hidden, title: t('tabs.requests'), tabBarIcon: ({ color }) => <BrandIcon name="solicitudes" size={22} color={color} /> }} />
      <Tabs.Screen name="documenti" options={{ title: t('tabs.documents'), tabBarIcon: ({ color }) => <BrandIcon name="docs" size={22} color={color} /> }} />
      <Tabs.Screen name="privacy" options={{ title: t('tabs.privacy'), tabBarIcon: ({ color }) => <BrandIcon name="misdatos" size={22} color={color} /> }} />
    </Tabs>
  );
}
