import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput,
  TouchableOpacity, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import {
  signInWithIdentifier, signUpWithUsername, requestPasswordReset, confirmPasswordReset,
} from '../services/session';
import { signInWithApple, signInWithGoogle, isAppleSupported, isExpoGo } from '../services/oauth';
import { useTheme } from '../theme/ThemeContext';
import { Fonts, Radii } from '../theme/elegant';
import { Icon } from '../components/elegant/Icons';
import { PressScale } from '../components/elegant/Kit';

type Mode = 'signin' | 'signup' | 'forgot' | 'reset';

/** Hoisted so re-renders don't remount the TextInput (which would dismiss the keyboard). */
function Field({
  label, value, onChange, placeholder, secure, keyboard, editable,
}: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string;
  secure?: boolean; keyboard?: 'default' | 'email-address' | 'number-pad'; editable?: boolean;
}) {
  const { c } = useTheme();
  return (
    <View>
      <Text style={{ fontSize: 9.5, fontFamily: Fonts.sansSemi, color: c.ink3, letterSpacing: 2.2, textTransform: 'uppercase', marginBottom: 7, marginTop: 15 }}>
        {label}
      </Text>
      <TextInput
        style={{ height: 48, paddingHorizontal: 16, backgroundColor: c.input, borderWidth: 1, borderColor: c.hairlineSoft, borderRadius: Radii.sm, color: c.ink, fontSize: 14, fontFamily: Fonts.sansLight }}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={c.ink3}
        secureTextEntry={secure}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType={keyboard ?? 'default'}
        editable={editable}
      />
    </View>
  );
}

/**
 * App front door. Shown by the auth gate when there's no session. On a successful
 * session, Supabase's onAuthStateChange flips the gate automatically.
 */
export function AuthScreen() {
  const insets = useSafeAreaInsets();
  const { c } = useTheme();
  const [mode, setMode] = useState<Mode>('signin');

  const [identifier, setIdentifier] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');

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
    setError(null); setInfo(null);
    if (!identifier.trim() || !password) return fail('Enter your email/username and password.');
    setLoading(true);
    const res = await signInWithIdentifier(identifier, password);
    if (!res.ok) return fail(res.error ?? 'Sign in failed.');
    setLoading(false);
  }, [identifier, password]);

  const doSignUp = useCallback(async () => {
    setError(null); setInfo(null);
    if (!email.trim() || !username.trim() || !password) return fail('Email, username, and password are required.');
    if (!/^[a-zA-Z0-9_]{3,30}$/.test(username.trim())) return fail('Username must be 3–30 chars: letters, digits, or underscore.');
    if (password.length < 8) return fail('Password must be at least 8 characters.');
    setLoading(true);
    const res = await signUpWithUsername(email, username, displayName, password);
    if (!res.ok) return fail(res.error ?? 'Sign up failed.');
    setLoading(false);
    if (res.needsConfirmation) {
      setInfo('Check your email to confirm your account, then sign in.');
      reset('signin');
    }
  }, [email, username, displayName, password, reset]);

  const doForgot = useCallback(async () => {
    setError(null); setInfo(null);
    if (!email.trim()) return fail('Enter your account email.');
    setLoading(true);
    const res = await requestPasswordReset(email);
    setLoading(false);
    if (!res.ok) return setError(res.error ?? 'Could not send reset code.');
    reset('reset');
    setInfo('We emailed you a 6-digit code. Enter it below with a new password.');
  }, [email, reset]);

  const doReset = useCallback(async () => {
    setError(null); setInfo(null);
    if (!email.trim() || !code.trim() || !password) return fail('Email, code, and a new password are required.');
    if (password.length < 8) return fail('Password must be at least 8 characters.');
    setLoading(true);
    const res = await confirmPasswordReset(email, code, password);
    setLoading(false);
    if (!res.ok) return setError(res.error ?? 'Could not reset password.');
    setPassword('');
    setCode('');
    reset('signin');
    setInfo('Password updated. Please sign in.');
  }, [email, code, password, reset]);

  const doOAuth = useCallback(async (provider: 'apple' | 'google') => {
    setError(null); setInfo(null);
    setLoading(true);
    const res = provider === 'apple' ? await signInWithApple() : await signInWithGoogle();
    setLoading(false);
    if (!res.ok && !res.cancelled) setError(res.error ?? 'Sign in failed.');
  }, []);

  const title =
    mode === 'signup' ? 'Create your account'
    : mode === 'forgot' ? 'Reset your password'
    : mode === 'reset' ? 'Enter your code'
    : 'Welcome back';

  const glassBtn = {
    backgroundColor: c.surface2, borderWidth: 1, borderColor: c.hairlineSoft,
    borderRadius: Radii.pill, paddingVertical: 14, alignItems: 'center' as const,
  };

  const link = (label: string, onPress: () => void, style?: object) => (
    <TouchableOpacity onPress={onPress} disabled={loading} style={style}>
      <Text style={{ color: c.gold, fontSize: 11.5, fontFamily: Fonts.sans, letterSpacing: 0.4 }}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 30, alignItems: 'center', paddingTop: insets.top + 34, paddingBottom: insets.bottom + 26 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ width: 74, height: 74, borderRadius: 37, borderWidth: 1, borderColor: c.hairline, backgroundColor: c.goldSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
          <Icon name="cross" size={28} color={c.gold} strokeWidth={1.4} />
        </View>
        <Text style={{ fontFamily: Fonts.serif, fontSize: 33, color: c.ink, letterSpacing: 0.6 }}>BibleWay</Text>
        <Text style={{ fontSize: 11, fontFamily: Fonts.sans, color: c.ink3, marginTop: 6, marginBottom: 12, letterSpacing: 2.2, textTransform: 'uppercase' }}>
          {title}
        </Text>

        <View style={{ width: '100%', maxWidth: 400 }}>
          {mode === 'signin' && (
            <>
              <Field label="Email or username" value={identifier} onChange={setIdentifier} placeholder="you@example.com or yourname" editable={!loading} />
              <Field label="Password" value={password} onChange={setPassword} placeholder="Your password" secure editable={!loading} />
              <View style={{ alignSelf: 'flex-end', marginTop: 8 }}>
                {link('Forgot password?', () => reset('forgot'))}
              </View>
            </>
          )}

          {mode === 'signup' && (
            <>
              <Field label="Email" value={email} onChange={setEmail} placeholder="you@example.com" keyboard="email-address" editable={!loading} />
              <Field label="Username" value={username} onChange={setUsername} placeholder="yourname" editable={!loading} />
              <Field label="Display name (optional)" value={displayName} onChange={setDisplayName} placeholder="Your name" editable={!loading} />
              <Field label="Password" value={password} onChange={setPassword} placeholder="At least 8 characters" secure editable={!loading} />
            </>
          )}

          {mode === 'forgot' && (
            <Field label="Account email" value={email} onChange={setEmail} placeholder="you@example.com" keyboard="email-address" editable={!loading} />
          )}

          {mode === 'reset' && (
            <>
              <Field label="Account email" value={email} onChange={setEmail} placeholder="you@example.com" keyboard="email-address" editable={!loading} />
              <Field label="6-digit code" value={code} onChange={setCode} placeholder="123456" keyboard="number-pad" editable={!loading} />
              <Field label="New password" value={password} onChange={setPassword} placeholder="At least 8 characters" secure editable={!loading} />
            </>
          )}

          {error && <Text style={{ color: c.live, fontSize: 12.5, fontFamily: Fonts.sans, marginTop: 15, lineHeight: 19 }}>{error}</Text>}
          {info && <Text style={{ color: c.gold, fontSize: 12.5, fontFamily: Fonts.sans, marginTop: 15, lineHeight: 19 }}>{info}</Text>}

          <PressScale
            onPress={
              mode === 'signin' ? doSignIn
              : mode === 'signup' ? doSignUp
              : mode === 'forgot' ? doForgot
              : doReset
            }
            disabled={loading}
            to={0.97}
          >
            <LinearGradient
              colors={[c.goldBright, c.gold]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={{ borderRadius: Radii.pill, paddingVertical: 15, alignItems: 'center', marginTop: 20, opacity: loading ? 0.6 : 1 }}
            >
              {loading ? (
                <ActivityIndicator color={c.onGold} />
              ) : (
                <Text style={{ color: c.onGold, fontSize: 13.5, fontFamily: Fonts.sansSemi, letterSpacing: 1.2 }}>
                  {mode === 'signin' ? 'Sign In' : mode === 'signup' ? 'Sign Up' : mode === 'forgot' ? 'Send Code' : 'Reset Password'}
                </Text>
              )}
            </LinearGradient>
          </PressScale>

          {(mode === 'signin' || mode === 'signup') && (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginVertical: 18 }}>
                <View style={{ flex: 1, height: 1, backgroundColor: c.hairlineSoft }} />
                <Text style={{ color: c.ink3, marginHorizontal: 14, fontSize: 9.5, letterSpacing: 2, textTransform: 'uppercase', fontFamily: Fonts.sans }}>or</Text>
                <View style={{ flex: 1, height: 1, backgroundColor: c.hairlineSoft }} />
              </View>

              {isExpoGo ? (
                <Text style={{ color: c.ink3, fontSize: 12, fontFamily: Fonts.sansLight, textAlign: 'center', lineHeight: 19 }}>
                  Google / Apple sign-in works in the installed app (a dev build), not in Expo Go.
                </Text>
              ) : (
                <>
                  <PressScale onPress={() => doOAuth('google')} disabled={loading} to={0.98}>
                    <View style={glassBtn}>
                      <Text style={{ color: c.ink, fontSize: 12.5, fontFamily: Fonts.sans, letterSpacing: 0.5 }}>Continue with Google</Text>
                    </View>
                  </PressScale>
                  {isAppleSupported && (
                    <PressScale onPress={() => doOAuth('apple')} disabled={loading} to={0.98}>
                      <View style={[glassBtn, { marginTop: 12 }]}>
                        <Text style={{ color: c.ink, fontSize: 12.5, fontFamily: Fonts.sans, letterSpacing: 0.5 }}>Continue with Apple</Text>
                      </View>
                    </PressScale>
                  )}
                </>
              )}
            </>
          )}

          <View style={{ alignItems: 'center', marginTop: 24 }}>
            {mode === 'signin' && link("Don't have an account? Sign up", () => reset('signup'))}
            {mode === 'signup' && link('Already have an account? Sign in', () => reset('signin'))}
            {(mode === 'forgot' || mode === 'reset') && link('Back to sign in', () => reset('signin'))}
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
