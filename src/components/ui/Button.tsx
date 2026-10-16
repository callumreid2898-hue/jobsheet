import type { ReactNode } from 'react';

interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'teal';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  onClick?: () => void;
  type?: 'button' | 'submit' | 'reset';
  children: ReactNode;
  className?: string;
}

const variantClasses = {
  primary:   'bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800',
  secondary: 'bg-gray-100 text-gray-900 hover:bg-gray-200 active:bg-gray-300',
  danger:    'bg-red-500 text-white hover:bg-red-600 active:bg-red-700',
  ghost:     'bg-transparent text-blue-600 hover:bg-blue-50 active:bg-blue-100',
  teal:      'bg-[#0D3349] text-white hover:bg-[#0f3d57] active:bg-[#0a2535]',
};

const sizeClasses = {
  sm: 'text-xs px-3 py-1.5 min-h-[36px]',
  md: 'text-sm px-4 py-2 min-h-[44px]',
  lg: 'text-base px-6 py-3 min-h-[52px]',
};

export function Button({
  variant = 'primary', size = 'md', loading, disabled, fullWidth,
  onClick, type = 'button', children, className = '',
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      onClick={onClick}
      className={`inline-flex items-center justify-center gap-2 font-medium rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${variantClasses[variant]} ${sizeClasses[size]} ${fullWidth ? 'w-full' : ''} ${className}`}
    >
      {loading && (
        <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
      )}
      {children}
    </button>
  );
}
