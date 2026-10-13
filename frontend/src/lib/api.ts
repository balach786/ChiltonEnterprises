import axios, { AxiosError, type AxiosRequestConfig } from 'axios';

const TOKEN_KEY = 'msms.accessToken';

/**
 * The token lives in sessionStorage for the lifetime of a browser tab only. It is an
 * access token for the Express API - never a database credential. All money and all
 * permissions are resolved server side.
 */
export const tokenStore = {
  get: (): string | null => {
    try {
      return window.sessionStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set: (token: string | null) => {
    try {
      if (token) window.sessionStorage.setItem(TOKEN_KEY, token);
      else window.sessionStorage.removeItem(TOKEN_KEY);
    } catch {
      /* storage unavailable (private mode) - the app still works in-memory */
    }
  },
};

export const API_BASE_URL: string = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '';

export const http = axios.create({
  baseURL: API_BASE_URL || undefined,
  timeout: 45000,
  headers: { 'Content-Type': 'application/json' },
});

http.interceptors.request.use((config) => {
  const token = tokenStore.get();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export interface ApiErrorBody {
  success: false;
  error: { code: string; message: string; details?: Array<{ path: string; message: string }> };
}

export class ApiError extends Error {
  status: number;
  code: string;
  details?: Array<{ path: string; message: string }>;

  constructor(message: string, status: number, code: string, details?: Array<{ path: string; message: string }>) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  get fieldErrors(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const detail of this.details ?? []) out[detail.path] = detail.message;
    return out;
  }
}

let onUnauthorized: (() => void) | null = null;
export function registerUnauthorizedHandler(handler: () => void) {
  onUnauthorized = handler;
}

http.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ApiErrorBody>) => {
    const status = error.response?.status ?? 0;
    const body = error.response?.data;
    const message =
      body?.error?.message ??
      (error.code === 'ECONNABORTED'
        ? 'The server took too long to respond. Please try again.'
        : status === 0
          ? 'Cannot reach the API server. Check that the backend is running and VITE_API_BASE_URL is correct.'
          : error.message);
    const apiError = new ApiError(message, status, body?.error?.code ?? 'NETWORK_ERROR', body?.error?.details);
    if (status === 401 && onUnauthorized) onUnauthorized();
    return Promise.reject(apiError);
  }
);

/** Standard envelope: { success, message?, data } - unwrap to `data`. */
export async function request<T>(config: AxiosRequestConfig): Promise<T> {
  const response = await http.request<{ success: boolean; message?: string; data: T }>(config);
  return response.data.data;
}

export async function requestBlob(config: AxiosRequestConfig): Promise<{ blob: Blob; filename: string | null }> {
  const response = await http.request<Blob>({ ...config, responseType: 'blob' });
  const disposition = response.headers?.['content-disposition'] as string | undefined;
  const filename = disposition ? /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition)?.[1] ?? null : null;
  return { blob: response.data, filename: filename ? decodeURIComponent(filename) : null };
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const detail = error.details?.[0];
    return detail ? `${error.message} — ${detail.message}` : error.message;
  }
  if (error instanceof Error) return error.message;
  return 'Something went wrong. Please try again.';
}

export function errorCode(error: unknown): string {
  return error instanceof ApiError ? error.code : 'UNKNOWN';
}
