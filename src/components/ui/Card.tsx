import type { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}

export function Card({ children, className = '', onClick }: CardProps) {
  return (
    <div
      className={`bg-white rounded-xl shadow-sm border border-gray-100 p-4 ${onClick ? 'cursor-pointer active:bg-gray-50' : ''} ${className}`}
      onClick={onClick}
    >
      {children}
    </div>
  );
}
