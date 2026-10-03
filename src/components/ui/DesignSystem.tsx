import React, { useEffect, useRef, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { useUIStore, type Toast } from '../../stores/ui';

/* ------------------------------- Logo ------------------------------- */

export const MonoChatLogo: React.FC<{
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}> = ({ size = 'sm', className = '' }) => {
  const sizeMap: Record<string, string> = {
    xs: 'w-5 h-5',
    sm: 'w-7 h-7',
    md: 'w-9 h-9',
    lg: 'w-11 h-11',
    xl: 'w-14 h-14',
  };

  return (
    <div
      className={`${sizeMap[size]} rounded-full bg-neutral-700/70 border border-white/10 relative overflow-hidden flex items-center justify-center shrink-0 select-none ${className}`}
    >
      <svg viewBox="0 0 32 32" className="w-full h-full" aria-hidden="true">
        <circle cx="16" cy="16" r="16" fill="#737373" />
        <path d="M16 16 L16 0 A16 16 0 0 1 32 16 Z" fill="#262626" />
      </svg>
    </div>
  );
};

/* ------------------------------ Button ------------------------------ */

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'icon';
  loading?: boolean;
  children: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  className = '',
  children,
  ...props
}) => {
  const baseStyles =
    'inline-flex items-center justify-center font-semibold tracking-tight transition-all duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--border-focus)] disabled:opacity-40 disabled:pointer-events-none whitespace-nowrap shrink-0 select-none cursor-pointer active:scale-[0.98]';

  const variantStyles: Record<string, string> = {
    primary:
      'bg-[var(--bg-inverted)] text-[var(--text-inverted)] hover:opacity-90 border border-transparent shadow-[var(--shadow-subtle)]',
    secondary:
      'bg-[var(--bg-elevated)] text-[var(--text-primary)] hover:bg-[var(--bg-hover)] border border-[var(--border-strong)]',
    outline:
      'bg-transparent text-[var(--text-primary)] border border-[var(--border-strong)] hover:bg-[var(--bg-hover)]',
    ghost:
      'bg-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] border border-transparent',
    danger:
      'bg-[var(--bg-elevated)] text-[var(--text-primary)] border border-[var(--border-strong)] hover:bg-[var(--bg-inverted)] hover:text-[var(--text-inverted)]',
  };

  const sizeStyles: Record<string, string> = {
    xs: 'h-7 px-2.5 text-xs rounded gap-1.5',
    sm: 'h-8 px-3 text-xs rounded-md gap-1.5',
    md: 'h-9 px-4 text-xs rounded-md gap-2',
    lg: 'h-10 px-5 text-sm rounded-md gap-2',
    icon: 'h-8 w-8 rounded-md p-0',
  };

  return (
    <button
      disabled={disabled || loading}
      className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
      {...props}
    >
      {loading && <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />}
      {children}
    </button>
  );
};

/* ------------------------------ Input ------------------------------- */

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  labelRight?: React.ReactNode;
  error?: string;
  hint?: string;
  leftIcon?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, labelRight, error, hint, leftIcon, className = '', id, type, ...props }, ref) => {
    const [showPassword, setShowPassword] = useState(false);
    const isPassword = type === 'password';
    const resolvedType = isPassword ? (showPassword ? 'text' : 'password') : type;
    const inputId = id || (label ? `input-${label.toLowerCase().replace(/\s+/g, '-')}` : undefined);

    return (
      <div className="w-full space-y-1.5">
        {(label || labelRight) && (
          <div className="flex items-center justify-between gap-2">
            {label && (
              <label
                htmlFor={inputId}
                className="block text-xs font-semibold text-[var(--text-secondary)]"
              >
                {label}
              </label>
            )}
            {labelRight}
          </div>
        )}
        <div className="relative flex items-center">
          {leftIcon && (
            <span className="absolute left-3 text-[var(--text-muted)] pointer-events-none flex items-center">
              {leftIcon}
            </span>
          )}
          <input
            ref={ref}
            id={inputId}
            type={resolvedType}
            className={`w-full h-9.5 ${leftIcon ? 'pl-9' : 'px-3'} ${
              isPassword ? 'pr-9' : 'pr-3'
            } text-sm bg-[var(--bg-elevated)] hover:bg-[var(--bg-hover)]/60 focus:bg-[var(--bg-surface)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] border ${
              error
                ? 'border-[var(--text-primary)] ring-1 ring-[var(--text-primary)]'
                : 'border-[var(--border-strong)] focus:border-[var(--border-focus)]'
            } rounded-md transition-colors duration-150 focus:outline-none ${className}`}
            {...props}
          />
          {isPassword && (
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-2.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] text-[10px] font-bold tracking-wider uppercase cursor-pointer"
              tabIndex={-1}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          )}
        </div>
        {(error || hint) && (
          <p className={`text-xs ${error ? 'text-[var(--text-primary)] font-medium' : 'text-[var(--text-muted)]'}`}>
            {error || hint}
          </p>
        )}
      </div>
    );
  },
);
Input.displayName = 'Input';

/* ----------------------------- Textarea ----------------------------- */

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, className = '', id, maxLength = 240, value, ...props }, ref) => {
    const textareaId = id || (label ? `textarea-${label.toLowerCase().replace(/\s+/g, '-')}` : undefined);
    return (
      <div className="w-full space-y-1.5">
        {label && (
          <label htmlFor={textareaId} className="block text-xs font-semibold text-[var(--text-secondary)]">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={textareaId}
          maxLength={maxLength}
          value={value}
          className={`w-full px-3 py-2 text-sm bg-[var(--bg-elevated)] hover:bg-[var(--bg-hover)]/60 focus:bg-[var(--bg-surface)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] border border-[var(--border-strong)] focus:border-[var(--border-focus)] rounded-md transition-colors duration-150 focus:outline-none resize-none ${className}`}
          {...props}
        />
      </div>
    );
  },
);
Textarea.displayName = 'Textarea';

/* ------------------------------ Avatar ------------------------------ */

interface AvatarProps {
  name: string;
  avatarUrl?: string | null;
  size?: number | 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  isOnline?: boolean;
  isSavedMessages?: boolean;
  showPresence?: boolean;
  className?: string;
}

const AVATAR_SIZES: Record<string, number> = {
  xs: 22,
  sm: 30,
  md: 38,
  lg: 42,
  xl: 56,
  '2xl': 72,
};

export const Avatar: React.FC<AvatarProps> = ({
  name,
  avatarUrl,
  size = 'md',
  isOnline = false,
  isSavedMessages = false,
  showPresence = true,
  className = '',
}) => {
  const px = typeof size === 'number' ? size : AVATAR_SIZES[size] || 38;
  const initials = (name || '?')
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div className={`relative shrink-0 select-none ${className}`} style={{ width: px, height: px }}>
      {isSavedMessages ? (
        <div
          className="w-full h-full rounded-full bg-[var(--bg-inverted)] text-[var(--text-inverted)] flex items-center justify-center border border-[var(--border-strong)]"
          aria-hidden="true"
        >
          <svg width={px * 0.5} height={px * 0.5} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 21l-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" />
          </svg>
        </div>
      ) : avatarUrl ? (
        <img
          src={avatarUrl}
          alt={name || 'Avatar'}
          className="w-full h-full rounded-full object-cover border border-[var(--border-strong)] bg-[var(--bg-elevated)]"
          referrerPolicy="no-referrer"
        />
      ) : (
        <div
          className="w-full h-full rounded-full bg-[var(--bg-elevated)] text-[var(--text-secondary)] font-bold flex items-center justify-center border border-[var(--border-strong)] tracking-tight"
          style={{ fontSize: px * 0.34 }}
          aria-hidden="true"
        >
          {initials || '?'}
        </div>
      )}
      {showPresence && (
        <span
          className={`absolute -bottom-0.5 -right-0.5 rounded-full border-2 border-[var(--bg-surface)] transition-colors ${
            isOnline ? 'bg-[var(--text-primary)]' : 'bg-[var(--text-muted)]'
          }`}
          style={{ width: Math.max(8, px * 0.26), height: Math.max(8, px * 0.26) }}
          aria-hidden="true"
        />
      )}
    </div>
  );
};

/* --------------------------- ThemeSwitcher --------------------------- */

export const ThemeSwitcher: React.FC<{
  mode: 'light' | 'dark' | 'system';
  onChange: (mode: 'light' | 'dark' | 'system') => void;
  className?: string;
}> = ({ mode, onChange, className = '' }) => {
  const options: { value: 'light' | 'dark' | 'system'; label: string; icon: string }[] = [
    { value: 'light', label: 'Light', icon: '○' },
    { value: 'dark', label: 'Dark', icon: '●' },
    { value: 'system', label: 'System', icon: '◐' },
  ];
  return (
    <div className={`flex items-center gap-0.5 p-0.5 bg-[var(--bg-elevated)] border border-[var(--border-strong)] rounded-md ${className}`}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          title={opt.label}
          className={`flex-1 h-7 px-2.5 text-xs font-semibold rounded transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
            mode === opt.value
              ? 'bg-[var(--bg-inverted)] text-[var(--text-inverted)]'
              : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
          }`}
        >
          <span className="text-[10px]">{opt.icon}</span>
          <span className="hidden sm:inline">{opt.label}</span>
        </button>
      ))}
    </div>
  );
};

/* ------------------------------ Switch ------------------------------ */

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label?: string;
  description?: string;
}

export const Switch: React.FC<SwitchProps> = ({ checked, onChange, disabled, label, description }) => {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`flex items-center justify-between gap-4 w-full ${label ? '' : 'w-fit'} ${disabled ? 'opacity-50' : 'cursor-pointer'}`}
    >
      {(label || description) && (
        <span className="text-left">
          {label && <span className="block text-sm font-semibold text-[var(--text-primary)]">{label}</span>}
          {description && <span className="block text-xs text-[var(--text-muted)] mt-0.5">{description}</span>}
        </span>
      )}
      <span
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors duration-200 ${
          checked
            ? 'bg-[var(--bg-inverted)] border-[var(--bg-inverted)]'
            : 'bg-[var(--bg-hover)] border-[var(--border-strong)]'
        }`}
      >
        <span
          className={`inline-block h-3.5 w-3.5 transform rounded-full transition-transform duration-200 ${
            checked ? 'translate-x-[18px] bg-[var(--text-inverted)]' : 'translate-x-[3px] bg-[var(--text-muted)]'
          }`}
        />
      </span>
    </button>
  );
};
export const Toggle = Switch;

/* ------------------------------ Modal ------------------------------- */

export const Modal: React.FC<{
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  headerRight?: React.ReactNode;
}> = ({ open, onClose, title, subtitle, children, size = 'md', headerRight }) => {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  const sizeMap: Record<string, string> = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
  };

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 sm:p-6"
      onMouseDown={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={`w-full ${sizeMap[size]} max-h-[85vh] flex flex-col bg-[var(--bg-surface)] border border-[var(--border-strong)] rounded-lg shadow-[var(--shadow-elevated)] fade-in-up overflow-hidden`}
      >
        {(title || headerRight) && (
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[var(--border-color)] shrink-0">
            <div className="min-w-0">
              {title && <h2 className="text-sm font-bold tracking-tight text-[var(--text-primary)] truncate">{title}</h2>}
              {subtitle && <p className="text-xs text-[var(--text-muted)] mt-0.5 truncate">{subtitle}</p>}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {headerRight}
              <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
};

/* ----------------------------- Skeleton ----------------------------- */

export const Skeleton: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`animate-pulse bg-[var(--bg-hover)] rounded-md ${className}`} />
);

/* ------------------------------ Toasts ------------------------------ */

export const ToastContainer: React.FC = () => {
  const toasts = useUIStore((s) => s.toasts);
  const dismissToast = useUIStore((s) => s.dismissToast);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2 w-[calc(100%-2rem)] max-w-sm">
      {toasts.map((toast: Toast) => (
        <button
          key={toast.id}
          type="button"
          onClick={() => dismissToast(toast.id)}
          className="text-left toast-enter bg-[var(--bg-surface)] border border-[var(--border-strong)] rounded-md shadow-[var(--shadow-panel)] px-3.5 py-2.5 cursor-pointer hover:bg-[var(--bg-hover)] transition-colors"
        >
          <p className="text-xs font-bold text-[var(--text-primary)] truncate">{toast.title}</p>
          {toast.body && <p className="text-xs text-[var(--text-secondary)] mt-0.5 line-clamp-2">{toast.body}</p>}
        </button>
      ))}
    </div>
  );
};

/* ------------------------- Section label chip ------------------------ */

export const SectionLabel: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className = '',
}) => (
  <p className={`text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--text-muted)] ${className}`}>
    {children}
  </p>
);
