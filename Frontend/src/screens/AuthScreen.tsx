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
import {
  signInWithIdentifier,
  signUpWithUsername,
  requestPasswordReset,
  confirmPasswordReset,
} from '../services/session';
import {
  signInWithApple,
  signInWithGoogle,
  isAppleSupported,
  isExpoGo,
} from '../services/oauth';

type Mode = 'signin' | 'signup' | 'forgot' | 'reset';

/**
 * App front door. Shown by the auth gate when there's no session. On a successful
 * session, Supabase's onAuthStateChange flips the gate automatically.
 */
export function AuthScreen() {
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<Mode>('signin');

  // Shared fields
  const [identifier, setIdentifier] = useState(''); // email OR username (sign in)
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState(''); // reset code

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const reset = useCallback((next: Mode) => {
    setMode(next);
    setError(null);
    setInfo(null);
  }, []);

  const fail = (msg: string) => {
    setError(msg);
    setLoading(false);
  };

  const doSignIn = useCallback(async () => {
    setError(null);
    setInfo(null);
    if (!identifier.trim() || !password) return fail('Enter your email/username and password.');
    setLoading(true);
    const res = await signInWithIdentifier(identifier, password);
    if (!res.ok) return fail(res.error ?? 'Sign in failed.');
    setLoading(false); // gate swaps on success
  }, [identifier, password]);

  const doSignUp = useCallback(async () => {
    setError(null);
    setInfo(null);
    if (!email.trim() || !username.trim() || !password) {
      return fail('Email, username, and password are required.');
    }
    if (!/^[a-zA-Z0-9_]{3,30}$/.test(username.trim())) {
      return fail('Username must be 3–30 chars: letters, digits, or underscore.');
    }
    if (password.length < 8) return fail('Password must be at least 8 characters.');
    setLoading(true);

    // No availability gate — usernames are not restricted on taken-ness. If the
    // chosen handle already exists, the database auto-assigns a unique variant.
    const res = await signUpWithUsername(email, username, displayName, password);
    if (!res.ok) return fail(res.error ?? 'Sign up failed.');
    setLoading(false);
    if (res.needsConfirmation) {
      setInfo('Check your email to confirm your account, then sign in.');
      reset('signin');
    }
    // Otherwise a session was created and the gate swaps automatically.
  }, [email, username, displayName, password, reset]);

  const doForgot = useCallback(async () => {
    setError(null);
    setInfo(null);
    if (!email.trim()) return fail('Enter your account email.');
    setLoading(true);
    const res = await requestPasswordReset(email);
    setLoading(false);
    if (!res.ok) return setError(res.error ?? 'Could not send reset code.');
    setInfo('We emailed you a 6-digit code. Enter it below with a new password.');
    reset('reset');
    setInfo('We emailed you a 6-digit code. Enter it below with a new password.');
  }, [email, reset]);

  const doReset = useCallback(async () => {
    setError(null);
    setInfo(null);
    if (!email.trim() || !code.trim() || !password) {
      return fail('Email, code, and a new password are required.');
    }
    if (password.length < 8) return fail('Password must be at least 8 characters.');
    setLoading(true);
    const res = await confirmPasswordReset(email, code, password);
    setLoading(false);
    if (!res.ok) return setError(res.error ?? 'Could not reset password.');
    setInfo('Password updated. Please sign in.');
    setPassword('');
    setCode('');
    reset('signin');
    setInfo('Password updated. Please sign in.');
  }, [email, code, password, reset]);

  const doOAuth = useCallback(async (provider: 'apple' | 'google') => {
    setError(null);
    setInfo(null);
    setLoading(true);
    const res = provider === 'apple' ? await signInWithApple() : await signInWithGoogle();
    setLoading(false);
    if (!res.ok && !res.cancelled) setError(res.error ?? 'Sign in failed.');
    // success → gate swaps automatically.
  }, []);

  const title =
    mode === 'signup' ? 'Create your account'
    : mode === 'forgot' ? 'Reset your password'
    : mode === 'reset' ? 'Enter your code'
    : 'Welcome back';

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.container,
          { paddingTop: insets.top + Spacing['2xl'], paddingBottom: insets.bottom + Spacing.xl },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <LinearGradient colors={[Colors.gradientRedStart, Colors.gradientRedEnd]} style={styles.logo}>
          <Text style={styles.logoText}>✝</Text>
        </LinearGradient>
        <Text style={styles.title}>BibleWay</Text>
        <Text style={styles.subtitle}>{title}</Text>

        <View style={styles.form}>
          {/* SIGN IN */}
          {mode === 'signin' && (
            <>
              <Field label="Email or username" value={identifier} onChange={setIdentifier}
                placeholder="you@example.com or yourname" autoCap="none" editable={!loading} />
              <Field label="Password" value={password} onChange={setPassword}
                placeholder="Your password" secure editable={!loading} />
              <TouchableOpacity onPress={() => reset('forgot')} disabled={loading} style={styles.linkRight}>
                <Text style={styles.linkText}>Forgot password?</Text>
              </TouchableOpacity>
            </>
          )}

          {/* SIGN UP */}
          {mode === 'signup' && (
            <>
              <Field label="Email" value={email} onChange={setEmail}
                placeholder="you@example.com" autoCap="none" keyboard="email-address" editable={!loading} />
              <Field label="Username" value={username} onChange={setUsername}
                placeholder="yourname" autoCap="none" editable={!loading} />
              <Field label="Display name (optional)" value={displayName} onChange={setDisplayName}
                placeholder="Your name" editable={!loading} />
              <Field label="Password" value={password} onChange={setPassword}
                placeholder="At least 8 characters" secure editable={!loading} />
            </>
          )}

          {/* FORGOT */}
          {mode === 'forgot' && (
            <Field label="Account email" value={email} onChange={setEmail}
              placeholder="you@example.com" autoCap="none" keyboard="email-address" editable={!loading} />
          )}

          {/* RESET */}
          {mode === 'reset' && (
            <>
              <Field label="Account email" value={email} onChange={setEmail}
                placeholder="you@example.com" autoCap="none" keyboard="email-address" editable={!loading} />
              <Field label="6-digit code" value={code} onChange={setCode}
                placeholder="123456" autoCap="none" keyboard="number-pad" editable={!loading} />
              <Field label="New password" value={password} onChange={setPassword}
                placeholder="At least 8 characters" secure editable={!loading} />
            </>
          )}

          {error && <Text style={styles.error}>{error}</Text>}
          {info && <Text style={styles.info}>{info}</Text>}

          <TouchableOpacity
            style={[styles.primaryBtn, loading && styles.btnDisabled]}
            onPress={
              mode === 'signin' ? doSignIn
              : mode === 'signup' ? doSignUp
              : mode === 'forgot' ? doForgot
              : doReset
            }
            activeOpacity={0.85}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={Colors.textPrimary} />
            ) : (
              <Text style={styles.primaryText}>
                {mode === 'signin' ? 'Sign In'
                  : mode === 'signup' ? 'Sign Up'
                  : mode === 'forgot' ? 'Send Code'
                  : 'Reset Password'}
              </Text>
            )}
          </TouchableOpacity>

          {/* OAuth (sign in / sign up only) */}
          {(mode === 'signin' || mode === 'signup') && (
            <>
              <View style={styles.dividerRow}>
                <View style={styles.divider} />
                <Text style={styles.dividerText}>or</Text>
                <View style={styles.divider} />
              </View>

              {isExpoGo ? (
                <Text style={styles.note}>
                  Google / Apple sign-in works in the installed app (a dev build), not in Expo Go.
                </Text>
              ) : (
                <>
                  <TouchableOpacity
                    style={[styles.oauthBtn, loading && styles.btnDisabled]}
                    onPress={() => doOAuth('google')}
                    activeOpacity={0.85}
                    disabled={loading}
                  >
                    <Text style={styles.oauthText}>Continue with Google</Text>
                  </TouchableOpacity>

                  {isAppleSupported && (
                    <TouchableOpacity
                      style={[styles.oauthBtn, styles.appleBtn, loading && styles.btnDisabled]}
                      onPress={() => doOAuth('apple')}
                      activeOpacity={0.85}
                      disabled={loading}
                    >
                      <Text style={styles.oauthText}>Continue with Apple</Text>
                    </TouchableOpacity>
                  )}
                </>
              )}
            </>
          )}

          {/* Footer navigation */}
          <View style={styles.footer}>
            {mode === 'signin' && (
              <TouchableOpacity onPress={() => reset('signup')} disabled={loading}>
                <Text style={styles.linkText}>Don't have an account? Sign up</Text>
              </TouchableOpacity>
            )}
            {mode === 'signup' && (
              <TouchableOpacity onPress={() => reset('signin')} disabled={loading}>
                <Text style={styles.linkText}>Already have an account? Sign in</Text>
              </TouchableOpacity>
            )}
            {(mode === 'forgot' || mode === 'reset') && (
              <TouchableOpacity onPress={() => reset('signin')} disabled={loading}>
                <Text style={styles.linkText}>Back to sign in</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

interface FieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  secure?: boolean;
  editable?: boolean;
  autoCap?: 'none' | 'sentences';
  keyboard?: 'default' | 'email-address' | 'number-pad';
}
function Field({ label, value, onChange, placeholder, secure, editable, autoCap, keyboard }: FieldProps) {
  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={Colors.textMuted}
        secureTextEntry={secure}
        autoCapitalize={secure ? 'none' : (autoCap ?? 'sentences')}
        autoCorrect={false}
        keyboardType={keyboard ?? 'default'}
        editable={editable}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: Colors.background },
  container: { flexGrow: 1, paddingHorizontal: Spacing.xl, alignItems: 'center' },
  logo: {
    width: 76, height: 76, borderRadius: BorderRadius['2xl'],
    alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.base,
  },
  logoText: { fontSize: 38, color: Colors.textPrimary },
  title: { fontSize: Typography['4xl'], fontWeight: Typography.bold, color: Colors.textPrimary },
  subtitle: { fontSize: Typography.md, color: Colors.textSecondary, marginTop: Spacing.xs, marginBottom: Spacing.xl },
  form: { width: '100%', maxWidth: 400 },
  label: { fontSize: Typography.sm, color: Colors.textSecondary, marginBottom: Spacing.xs, marginTop: Spacing.base },
  input: {
    backgroundColor: Colors.surfaceElevated, borderWidth: 1, borderColor: Colors.border,
    borderRadius: BorderRadius.lg, paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
    color: Colors.textPrimary, fontSize: Typography.md,
  },
  error: { color: Colors.error, fontSize: Typography.base, marginTop: Spacing.base },
  info: { color: Colors.success, fontSize: Typography.base, marginTop: Spacing.base },
  primaryBtn: {
    backgroundColor: Colors.primary, borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.base, alignItems: 'center', marginTop: Spacing.lg,
  },
  primaryText: { color: Colors.textPrimary, fontSize: Typography.md, fontWeight: Typography.semibold },
  btnDisabled: { opacity: 0.6 },
  dividerRow: { flexDirection: 'row', alignItems: 'center', marginVertical: Spacing.lg },
  divider: { flex: 1, height: 1, backgroundColor: Colors.border },
  dividerText: { color: Colors.textMuted, marginHorizontal: Spacing.md, fontSize: Typography.sm },
  oauthBtn: {
    backgroundColor: Colors.surfaceElevated, borderWidth: 1, borderColor: Colors.borderLight,
    borderRadius: BorderRadius.lg, paddingVertical: Spacing.base, alignItems: 'center', marginTop: Spacing.md,
  },
  appleBtn: { backgroundColor: '#000', borderColor: Colors.borderLight },
  oauthText: { color: Colors.textPrimary, fontSize: Typography.md, fontWeight: Typography.medium },
  note: { color: Colors.textMuted, fontSize: Typography.base, textAlign: 'center', lineHeight: 20 },
  linkRight: { alignSelf: 'flex-end', marginTop: Spacing.sm },
  linkText: { color: Colors.primaryLight, fontSize: Typography.base },
  footer: { alignItems: 'center', marginTop: Spacing.xl },
});
