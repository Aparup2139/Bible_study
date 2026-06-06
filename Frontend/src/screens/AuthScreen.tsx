import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Typography, Spacing, BorderRadius } from '../theme';
import { signInWithPassword, signUpWithPassword } from '../services/session';

type Mode = 'signin' | 'signup';

/**
 * The app's front door. Shown by the auth gate whenever there is no session.
 * On success, Supabase's onAuthStateChange (in useAuthSession) flips the gate
 * and the app renders — no manual navigation needed.
 */
export function AuthScreen() {
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const isSignup = mode === 'signup';

  const submit = useCallback(async () => {
    setError(null);
    setInfo(null);
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setLoading(true);
    const result = isSignup
      ? await signUpWithPassword(email, password)
      : await signInWithPassword(email, password);
    setLoading(false);

    if (!result.ok) {
      setError(result.error ?? 'Something went wrong.');
      return;
    }
    if (result.needsConfirmation) {
      setInfo('Check your email to confirm your account, then sign in.');
      setMode('signin');
    }
    // On a real session, the auth gate swaps screens automatically.
  }, [email, password, isSignup]);

  const toggleMode = useCallback(() => {
    setMode((m) => (m === 'signin' ? 'signup' : 'signin'));
    setError(null);
    setInfo(null);
  }, []);

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.container,
          { paddingTop: insets.top + Spacing['3xl'], paddingBottom: insets.bottom + Spacing.xl },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Brand */}
        <LinearGradient
          colors={[Colors.gradientRedStart, Colors.gradientRedEnd]}
          style={styles.logo}
        >
          <Text style={styles.logoText}>✝</Text>
        </LinearGradient>
        <Text style={styles.title}>BibleWay</Text>
        <Text style={styles.subtitle}>
          {isSignup ? 'Create your account' : 'Welcome back'}
        </Text>

        {/* Form */}
        <View style={styles.form}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor={Colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="emailAddress"
            editable={!loading}
          />

          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="At least 8 characters"
            placeholderTextColor={Colors.textMuted}
            secureTextEntry
            autoCapitalize="none"
            textContentType={isSignup ? 'newPassword' : 'password'}
            editable={!loading}
          />

          {error && <Text style={styles.error}>{error}</Text>}
          {info && <Text style={styles.info}>{info}</Text>}

          <TouchableOpacity
            style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
            onPress={submit}
            activeOpacity={0.85}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={Colors.textPrimary} />
            ) : (
              <Text style={styles.submitText}>
                {isSignup ? 'Sign Up' : 'Sign In'}
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity onPress={toggleMode} style={styles.toggle} disabled={loading}>
            <Text style={styles.toggleText}>
              {isSignup
                ? 'Already have an account? Sign in'
                : "Don't have an account? Sign up"}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: Colors.background },
  container: {
    flexGrow: 1,
    paddingHorizontal: Spacing.xl,
    alignItems: 'center',
  },
  logo: {
    width: 80,
    height: 80,
    borderRadius: BorderRadius['2xl'],
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
  },
  logoText: { fontSize: 40, color: Colors.textPrimary },
  title: {
    fontSize: Typography['4xl'],
    fontWeight: Typography.bold,
    color: Colors.textPrimary,
  },
  subtitle: {
    fontSize: Typography.md,
    color: Colors.textSecondary,
    marginTop: Spacing.xs,
    marginBottom: Spacing['2xl'],
  },
  form: { width: '100%', maxWidth: 400 },
  label: {
    fontSize: Typography.sm,
    color: Colors.textSecondary,
    marginBottom: Spacing.xs,
    marginTop: Spacing.base,
  },
  input: {
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    color: Colors.textPrimary,
    fontSize: Typography.md,
  },
  error: {
    color: Colors.error,
    fontSize: Typography.base,
    marginTop: Spacing.base,
  },
  info: {
    color: Colors.success,
    fontSize: Typography.base,
    marginTop: Spacing.base,
  },
  submitBtn: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.base,
    alignItems: 'center',
    marginTop: Spacing.xl,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitText: {
    color: Colors.textPrimary,
    fontSize: Typography.md,
    fontWeight: Typography.semibold,
  },
  toggle: { alignItems: 'center', marginTop: Spacing.lg },
  toggleText: { color: Colors.primaryLight, fontSize: Typography.base },
});
