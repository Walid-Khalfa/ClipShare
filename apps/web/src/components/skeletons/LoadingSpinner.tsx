'use client';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  label?: string;
}

export function LoadingSpinner({ 
  size = 'md', 
  className = '',
  label = 'Loading'
}: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: 'w-5 h-5 border-2',
    md: 'w-8 h-8 border-3',
    lg: 'w-12 h-12 border-4',
  };

  return (
    <div 
      role="status" 
      aria-live="polite" 
      aria-label={label}
      className={`flex items-center justify-center ${className}`}
    >
      <div
        className={`
          ${sizeClasses[size]}
          border-slate-700 
          border-t-primary-500 
          rounded-full 
          animate-spin
        `}
        aria-hidden="true"
      />
      <span className="sr-only">{label}...</span>
    </div>
  );
}
