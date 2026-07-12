import { Stack } from 'expo-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useFonts } from 'expo-font';
import {
  CormorantGaramond_500Medium,
  CormorantGaramond_500Medium_Italic,
  CormorantGaramond_600SemiBold,
} from '@expo-google-fonts/cormorant-garamond';
import {
  Outfit_300Light,
  Outfit_400Regular,
  Outfit_500Medium,
  Outfit_600SemiBold,
} from '@expo-google-fonts/outfit';
import { queryClient } from '../src/services/queryClient';
import { useAuthSession } from '../src/services/session';
import { useSyncProfileToStore } from '../src/hooks/useProfile';
import { AuthScreen } from '../src/screens/AuthScreen';
import { ThemeProvider, useTheme } from '../src/theme/ThemeContext';

/**
 * Renders the app stack once authenticated. Hydrates the global store with the
 * signed-in user's profile (the hook is a no-op until a session exists).
 */
function AppStack() {
  useSyncProfileToStore();
  const { c, isDark } = useTheme();
  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} backgroundColor={c.bg} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: c.bg },
          animation: 'none',
        }}
      >
        <Stack.Screen name="index" />
      </Stack>
    </>
  );
}

/** Themed full-screen spinner (session restore / font load). */
function Loading() {
  const { c } = useTheme();
  return (
    <View style={[styles.center, { backgroundColor: c.bg }]}>
      <ActivityIndicator color={c.gold} size="large" />
    </View>
  );
}

/**
 * Auth gate: no session -> AuthScreen; restoring -> spinner; signed in -> app.
 */
function Gate() {
  const { loading, isAuthenticated } = useAuthSession();
  if (loading) return <Loading />;
  return isAuthenticated ? <AppStack /> : <AuthScreen />;
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    CormorantGaramond_500Medium,
    CormorantGaramond_500Medium_Italic,
    CormorantGaramond_600SemiBold,
    Outfit_300Light,
    Outfit_400Regular,
    Outfit_500Medium,
    Outfit_600SemiBold,
  });

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            {fontsLoaded ? <Gate /> : <Loading />}
          </ThemeProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
