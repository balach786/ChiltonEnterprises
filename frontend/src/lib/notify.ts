/**
 * Toasts are the only reason `sonner` (~80 KB gzipped) used to sit in the entry bundle.
 * This wrapper keeps the familiar `toast.success(...) / toast.error(...)` call signature but
 * loads the library on the first toast instead, so the first paint does not wait for it.
 *
 * Calls made before the library finishes loading are buffered and shown as soon as it arrives,
 * so no message is ever dropped.
 */

type ToastKind = 'success' | 'error';
type ToastOptions = { description?: string; duration?: number };
type ToastApi = {
  success: (message: string, options?: ToastOptions) => void;
  error: (message: string, options?: ToastOptions) => void;
};

let api: ToastApi | null = null;
let loading: Promise<ToastApi> | null = null;
const buffered: Array<{ kind: ToastKind; message: string; options?: ToastOptions }> = [];

function load(): Promise<ToastApi> {
  if (api) return Promise.resolve(api);
  loading ??= import('sonner').then((sonner) => {
    api = { success: sonner.toast.success, error: sonner.toast.error };
    while (buffered.length > 0) {
      const item = buffered.shift();
      if (item) api[item.kind](item.message, item.options);
    }
    return api;
  });
  return loading;
}

/** Load the toast library eagerly once the app is idle (keeps the first toast instant). */
export function preloadToasts(): void {
  void load();
}

function push(kind: ToastKind, message: string, options?: ToastOptions): void {
  if (api) {
    api[kind](message, options);
    return;
  }
  buffered.push({ kind, message, options });
  void load();
}

export const toast = {
  success: (message: string, options?: ToastOptions) => push('success', message, options),
  error: (message: string, options?: ToastOptions) => push('error', message, options),
};
