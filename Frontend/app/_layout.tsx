import { Stack } from 'expo-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { queryClient } from '../src/services/queryClient';
import { useAuthSession } from '../src/services/session';
import { useSyncProfileToStore } from '../src/hooks/useProfile';
import { AuthScreen } from '../src/screens/AuthScreen';
import { Colors } from '../src/theme';

/**
 * Renders the app stack once authenticated. Hydrates the global store with the
 * signed-in user's profile (the hook is a no-op until a session exists).
 */
function AppStack() {
  useSyncProfileToStore();
  return (
    <>
      <StatusBar style="light" backgroundColor="#000" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#000' },
          animation: 'none',
        }}
      >
        <Stack.Screen name="index" />
      </Stack>
    </>
  );
}

/**
 * Auth gate: no session -> AuthScreen; restoring -> spinner; signed in -> app.
 * useAuthSession also wires the API token provider on mount.
 */
function Gate() {
  const { loading, isAuthenticated } = useAuthSession();

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={Colors.primaryLight} size="large" />
      </View>
    );
  }
  return isAuthenticated ? <AppStack /> : <AuthScreen />;
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <Gate />
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.background },
});
