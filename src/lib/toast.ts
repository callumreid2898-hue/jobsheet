import type { Toast, ToastKind } from '../hooks/useToast';

// App-wide toasts for code outside a component (writeRecords). Shown by <GlobalToasts />.

type Listener = (toasts: Toast[]) => void;

let toasts: Toast[] = [];
const listeners = new Set<Listener>();

function emit() {
  listeners.forEach(l => l(toasts));
}

export function subscribeToToasts(listener: Listener): () => void {
  listeners.add(listener);
  listener(toasts);
  return () => listeners.delete(listener);
}

export function dismissToast(id: string) {
  toasts = toasts.filter(t => t.id !== id);
  emit();
}

export function showToast(message: string, kind: ToastKind = 'info', durationMs = 5000) {
  const id = crypto.randomUUID();
  toasts = [...toasts, { id, message, kind }];
  emit();
  setTimeout(() => dismissToast(id), durationMs);
}
