/**
 * Typed HTTP client for the BibleWay backend API.
 *
 * Zero extra dependencies — uses the built-in fetch. Reads the base URL from
 * `EXPO_PUBLIC_API_URL` (set in `.env` / app config); falls back to localhost
 * for local development.
 *
 * Phase 0: the client exists but the app still uses mock data. As each backend
 * phase lands, swap the `queryFn` bodies in `src/hooks/` to call `api.get(...)`.
 * Auth wiring (Phase 1) will call `setAuthTokenProvider` so every request carries
 * the Supabase access token.
 */

import Constants from 'expo-constants';

const API_PORT = 3000;
const API_PREFIX = '/api/v1';

/**
 * Resolve the backend base URL.
 *
 * Priority:
 *  1. EXPO_PUBLIC_API_URL when it's a real host (not localhost) — production / explicit.
 *  2. In dev, derive the host from Expo's Metro connection (`hostUri` looks like
 *     "192.168.1.50:8081"), so a physical phone hits your PC's LAN IP automatically
 *     instead of `localhost` (which on a device means the device itself).
 *  3. Fallback to localhost (web / last resort).
 */
function resolveBaseUrl(): string {
  const explicit = process.env.EXPO_PUBLIC_API_URL as string | undefined;
  if (explicit && !/(localhost|127\.0\.0\.1)/.test(explicit)) return explicit;

  const c = Constants as unknown as {
    expoConfig?: { hostUri?: string };
    manifest?: { debuggerHost?: string };
    manifest2?: { extra?: { expoGo?: { debuggerHost?: string } } };
  };
  const hostUri =
    c.expoConfig?.hostUri ??
    c.manifest?.debuggerHost ??
    c.manifest2?.extra?.expoGo?.debuggerHost ??
    '';
  const host = String(hostUri).split(':')[0];
  if (host && host !== 'localhost' && host !== '127.0.0.1') {
    return `http://${host}:${API_PORT}${API_PREFIX}`;
  }
  return explicit ?? `http://localhost:${API_PORT}${API_PREFIX}`;
}

const BASE_URL = resolveBaseUrl();

type AuthTokenProvider = () => string | null | Promise<string | null>;

let authTokenProvider: AuthTokenProvider | null = null;

/** Register a function that returns the current access token (set up in Phase 1). */
export function setAuthTokenProvider(provider: AuthTokenProvider): void {
  authTokenProvider = provider;
}

/**
 * Optional handler invoked on a 401. Should attempt a token refresh and return
 * true if it succeeded (the request is retried once) or false to give up
 * (typically after signing the user out). Registered by the auth layer.
 */
type UnauthorizedHandler = () => Promise<boolean>;
let unauthorizedHandler: UnauthorizedHandler | null = null;

export function setUnauthorizedHandler(handler: UnauthorizedHandler): void {
  unauthorizedHandler = handler;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface RequestOptions {
  /** Query-string params; undefined/null values are skipped. */
  query?: Record<string, string | number | boolean | undefined | null>;
  signal?: AbortSignal;
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const url = new URL(
    path.startsWith('/') ? path.slice(1) : path,
    BASE_URL.endsWith('/') ? BASE_URL : `${BASE_URL}/`,
  );
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url.toString();
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  options?: RequestOptions,
  retried = false,
): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };

  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const token = authTokenProvider ? await authTokenProvider() : null;
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(buildUrl(path, options?.query), {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: options?.signal,
  });

  // On a 401, try one token refresh + retry before surfacing the error.
  // Only attempt a refresh+retry if this request actually carried a token
  // (a 401 on an unauthenticated call — e.g. a failed login — is not a refresh case).
  if (res.status === 401 && !retried && token && unauthorizedHandler) {
    const refreshed = await unauthorizedHandler();
    if (refreshed) return request<T>(method, path, body, options, true);
  }

  const isJson = res.headers.get('content-type')?.includes('application/json');
  const payload = isJson ? await res.json().catch(() => undefined) : undefined;

  if (!res.ok) {
    const message =
      (payload as { message?: string } | undefined)?.message ??
      `Request failed: ${res.status} ${res.statusText}`;
    throw new ApiError(res.status, message, payload);
  }

  return payload as T;
}

export const api = {
  baseUrl: BASE_URL,
  get: <T>(path: string, options?: RequestOptions) =>
    request<T>('GET', path, undefined, options),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>('POST', path, body, options),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>('PATCH', path, body, options),
  put: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>('PUT', path, body, options),
  delete: <T>(path: string, options?: RequestOptions) =>
    request<T>('DELETE', path, undefined, options),
};
