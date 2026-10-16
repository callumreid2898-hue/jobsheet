import type { Toast, ToastKind } from '../../hooks/useToast';

const kindStyles: Record<ToastKind, string> = {
  success: 'bg-green-600 text-white',
  error:   'bg-red-600 text-white',
  warning: 'bg-amber-500 text-white',
  info:    'bg-[#0D3349] text-white',
};

interface ToastStackProps {
  toasts: Toast[];
  onRemove: (id: string) => void;
}

export function ToastStack({ toasts, onRemove }: ToastStackProps) {
  if (toasts.length === 0) return null;
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full px-4 sm:px-0">
      {toasts.map(t => (
        <div
          key={t.id}
          className={`flex items-center justify-between gap-3 px-4 py-3 rounded-lg shadow-md text-sm font-medium ${kindStyles[t.kind]}`}
        >
          <span>{t.message}</span>
          <button
            onClick={() => onRemove(t.id)}
            className="shrink-0 opacity-70 hover:opacity-100 transition-opacity"
            aria-label="Dismiss"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}
