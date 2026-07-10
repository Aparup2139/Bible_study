/**
 * Native OAuth (Phase 1, Workstream C3) — Google + Apple via id-token exchange.
 *
 * The native modules are loaded with require() INSIDE the handlers (not top-level
 * imports) so the app still bundles/runs in Expo Go where these native modules are
 * unavailable. Pressing a button there returns a friendly "needs a dev build"
 * message instead of crashing.
 */
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { supabase } from './supabase';

// Metro provides require() at runtime; declare it so TypeScript is satisfied.
declare const require: (name: string) => any;

export interface OAuthResult {
  ok: boolean;
  cancelled?: boolean;
  error?: string;
}

/** Expo Go cannot load native OAuth modules — only a dev/production build can. */
export const isExpoGo = Constants.executionEnvironment === 'storeClient';

/** Apple sign-in is iOS-only. */
export const isAppleSupported = Platform.OS === 'ios';

export async function signInWithApple(): Promise<OAuthResult> {
  if (isExpoGo) return { ok: false, error: 'Apple sign-in needs the installed app (a dev build), not Expo Go.' };
  try {
    const AppleAuthentication = require('expo-apple-authentication');
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });
    if (!credential.identityToken) {
      return { ok: false, error: 'No identity token returned by Apple.' };
    }
    const { error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: credential.identityToken,
    });
    if (error) return { ok: false, error: error.message };

    // Apple only provides the full name on the FIRST sign-in — capture it then.
    if (credential.fullName?.givenName) {
      const fullName = [
        credential.fullName.givenName,
        credential.fullName.familyName,
      ]
        .filter(Boolean)
        .join(' ');
      await supabase.auth.updateUser({ data: { full_name: fullName } });
    }
    return { ok: true };
  } catch (e: any) {
    if (e?.code === 'ERR_REQUEST_CANCELED') return { ok: false, cancelled: true };
    return { ok: false, error: nativeMissing(e, 'Apple') };
  }
}

/**
 * The OAuth 2.0 **Web** client ID from Google Cloud Console — the same one
 * registered under Supabase → Auth → Providers → Google. Required for the
 * native lib to mint an idToken Supabase will accept.
 */
const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID as string | undefined;

let googleConfigured = false;

export async function signInWithGoogle(): Promise<OAuthResult> {
  if (isExpoGo) return { ok: false, error: 'Google sign-in needs the installed app (a dev build), not Expo Go.' };
  if (!GOOGLE_WEB_CLIENT_ID) {
    return { ok: false, error: 'Google sign-in is not configured yet (missing EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID).' };
  }
  try {
    const { GoogleSignin } = require('@react-native-google-signin/google-signin');
    if (!googleConfigured) {
      GoogleSignin.configure({ webClientId: GOOGLE_WEB_CLIENT_ID });
      googleConfigured = true;
    }
    await GoogleSignin.hasPlayServices();
    const result = await GoogleSignin.signIn();
    // The lib has returned the token at result.idToken (v13-) or result.data.idToken (v14+).
    const idToken = result?.idToken ?? result?.data?.idToken;
    if (!idToken) return { ok: false, error: 'No ID token returned by Google.' };
    const { error } = await supabase.auth.signInWithIdToken({
      provider: 'google',
      token: idToken,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e: any) {
    const code = e?.code;
    if (code === '-5' || code === 'SIGN_IN_CANCELLED') {
      return { ok: false, cancelled: true };
    }
    return { ok: false, error: nativeMissing(e, 'Google') };
  }
}

function nativeMissing(e: any, provider: string): string {
  const msg = e?.message ?? String(e);
  if (/cannot find module|requirenativemodule|not available|native module|undefined is not/i.test(msg)) {
    return `${provider} sign-in requires a custom dev build (not available in Expo Go).`;
  }
  return msg;
}
