/**
 * Guarded access to the Agora RTC native module (react-native-agora).
 *
 * Expo Go is a fixed prebuilt binary with no Agora native code — importing the
 * module there crashes the app. This wrapper lazy-requires it only outside Expo
 * Go (same pattern the old WebRTC screen used), so every other screen keeps
 * working in Expo Go and the live screens can show a "needs dev build" card.
 *
 * Type-only imports are erased at compile time and safe everywhere.
 */
import Constants from 'expo-constants';
import type { IRtcEngine } from 'react-native-agora';

const IS_EXPO_GO = Constants.executionEnvironment === 'storeClient';

type AgoraModule = typeof import('react-native-agora');

let agora: AgoraModule | null = null;
if (!IS_EXPO_GO) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    agora = require('react-native-agora') as AgoraModule;
  } catch {
    agora = null;
  }
}

export function isAgoraAvailable(): boolean {
  return agora != null;
}

/** The raw module (RtcSurfaceView, enums). Null in Expo Go — check isAgoraAvailable(). */
export function getAgora(): AgoraModule | null {
  return agora;
}

let engine: IRtcEngine | null = null;
let engineAppId: string | null = null;

/**
 * Create-or-reuse the singleton engine, initialized for live broadcasting.
 * The appId comes from the backend (go-live / token responses).
 */
export function getEngine(appId: string): IRtcEngine {
  if (!agora) throw new Error('Agora is unavailable — install the dev build.');
  if (engine && engineAppId === appId) return engine;
  if (engine) destroyEngine();
  engine = agora.createAgoraRtcEngine();
  engine.initialize({
    appId,
    channelProfile: agora.ChannelProfileType.ChannelProfileLiveBroadcasting,
  });
  engineAppId = appId;
  return engine;
}

export function destroyEngine(): void {
  if (!engine) return;
  try {
    engine.release();
  } catch {
    /* releasing a dead engine is fine */
  }
  engine = null;
  engineAppId = null;
}
