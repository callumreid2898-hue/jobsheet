import { useEffect, useState } from 'react';
import type { Toast } from '../../hooks/useToast';
import { dismissToast, subscribeToToasts } from '../../lib/toast';
import { ToastStack } from './Toast';

export function GlobalToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  useEffect(() => subscribeToToasts(setToasts), []);
  return <ToastStack toasts={toasts} onRemove={dismissToast} />;
}
