import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronDown,
  Info,
  Loader2,
  Moon,
  Monitor,
  Sun,
  X,
} from 'lucide-react';
import { useUIStore, type Toast } from '../../stores/ui';

/* ------------------------------- Logo ------------------------------- */

export const MonoChatLogo: React.FC<{
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  variant?: 'framed' | 'bare';
  className?: string;
}> = ({ size = 'sm', variant = 'framed', className = '' }) => {
  const sizeMap: Record<string, { frame: string; svg: string }> = {
    xs: { frame: 'w-6 h-6 rounded-md p-1', svg: 'w-4 h-4' },
    sm: { frame: 'w-8 h-8 rounded-lg p-1.5', svg: 'w-5 h-5' },
    md: { frame: 'w-10 h-10 rounded-xl p-2', svg: 'w-6 h-6' },
    lg: { frame: 'w-12 h-12 rounded-xl p-2.5', svg: 'w-7 h-7' },
    xl: { frame: 'w-16 h-16 rounded-2xl p-3.5', svg: 'w-9 h-9' },
  };

  const currentSize = sizeMap[size] || sizeMap.sm;

  const logoSvg = (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`${currentSize.svg} transition-transform duration-200 group-hover:scale-105`}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="mc_g_left" x1="4" y1="6" x2="16" y2="26" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#A1A1AA" />
        </linearGradient>
        <linearGradient id="mc_g_right" x1="16" y1="6" x2="28" y2="26" gradientUnits="userSpaceOnUse">
          <stop stopColor="#F4F4F6" />
          <stop offset="100%" stopColor="#71717A" />
        </linearGradient>
        <linearGradient id="mc_g_center" x1="10" y1="6" x2="22" y2="18" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#D4D4D8" />
        </linearGradient>
      </defs>

      {/* Modern architectural faceted monogram: Precision "M" with conversational apex */}
      {/* Left pillar & chevron */}
      <path
        d="M5 25V9C5 7.9 5.9 7 7 7H9.2L16 16.5L13.2 20.2L7.8 12.8V25H5Z"
        fill="url(#mc_g_left)"
      />
      {/* Right pillar with angled chat speech fold */}
      <path
        d="M27 7V23C27 24.1 26.1 25 25 25H21.5L16 16.5L18.8 12.8L24.2 20.2V7H27Z"
        fill="url(#mc_g_right)"
      />
      {/* Central diamond apex beacon */}
      <path
        d="M16 6L19 10.5L16 14.5L13 10.5L16 6Z"
        fill="url(#mc_g_center)"
      />
    </svg>
  );

  if (variant === 'bare') {
    return (
      <div className={`inline-flex items-center justify-center select-none group ${className}`}>
        {logoSvg}
      </div>
    );
  }

  return (
    <div
      className={`${currentSize.frame} bg-gradient-to-b from-[#1c1c22] to-[#0c0c0f] border border-white/15 shadow-[0_2px_8px_rgba(0,0,0,0.5)] flex items-center justify-center shrink-0 select-none group transition-all duration-200 hover:border-white/30 hover:shadow-[0_4px_16px_rgba(255,255,255,0.08)] ${className}`}
      title="MonoChat"
    >
      {logoSvg}
    </div>
  );
};

/* ------------------------------ Button ------------------------------ */

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'subtle';
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'icon';
  loading?: boolean;
  children?: React.ReactNode;
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
    'inline-flex items-center justify-center font-medium tracking-tight transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-focus)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--bg-canvas)] disabled:opacity-40 disabled:pointer-events-none whitespace-nowrap shrink-0 select-none cursor-pointer active:scale-[0.98]';

  const variantStyles: Record<string, string> = {
    primary:
      'bg-[var(--bg-inverted)] text-[var(--text-inverted)] hover:opacity-90 shadow-sm border border-transparent font-semibold',
    secondary:
      'bg-[var(--bg-elevated)] text-[var(--text-primary)] hover:bg-[var(--bg-hover)] border border-[var(--border-strong)] shadow-xs',
    outline:
      'bg-transparent text-[var(--text-primary)] border border-[var(--border-strong)] hover:bg-[var(--bg-hover)] hover:border-[var(--border-focus)]',
    ghost:
      'bg-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] border border-transparent',
    danger:
      'bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 border border-rose-500/20 hover:border-rose-500/40',
    subtle:
      'bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] border border-[var(--border-subtle)]',
  };

  const sizeStyles: Record<string, string> = {
    xs: 'h-7 px-2.5 text-xs rounded-lg gap-1.5',
    sm: 'h-8 px-3 text-xs rounded-lg gap-1.5',
    md: 'h-9 px-4 text-xs rounded-xl gap-2',
    lg: 'h-11 px-5 text-sm rounded-xl gap-2.5 font-semibold',
    icon: 'h-9 w-9 rounded-xl p-0',
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
  rightIcon?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, labelRight, error, hint, leftIcon, rightIcon, className = '', id, type, ...props }, ref) => {
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
                className="block text-xs font-semibold text-[var(--text-secondary)] select-none"
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
            className={`w-full h-10 ${leftIcon ? 'pl-9' : 'px-3.5'} ${
              isPassword || rightIcon ? 'pr-11' : 'pr-3.5'
            } text-sm bg-[var(--bg-elevated)] hover:bg-[var(--bg-hover)]/60 focus:bg-[var(--bg-surface)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] border ${
              error
                ? 'border-rose-500/80 ring-1 ring-rose-500/40'
                : 'border-[var(--border-strong)] focus:border-[var(--border-focus)]'
            } rounded-xl transition-all duration-150 focus:outline-none focus:ring-1 focus:ring-[var(--border-focus)] shadow-xs ${className}`}
            {...props}
          />
          {isPassword ? (
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 text-[var(--text-muted)] hover:text-[var(--text-primary)] text-[10px] font-semibold tracking-wider uppercase cursor-pointer select-none transition-colors"
              tabIndex={-1}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          ) : (
            rightIcon && (
              <span className="absolute right-3 text-[var(--text-muted)] flex items-center">
                {rightIcon}
              </span>
            )
          )}
        </div>
        {(error || hint) && (
          <p className={`text-xs ${error ? 'text-rose-400 font-medium' : 'text-[var(--text-muted)]'}`}>
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
          <label htmlFor={textareaId} className="block text-xs font-semibold text-[var(--text-secondary)] select-none">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={textareaId}
          maxLength={maxLength}
          value={value}
          className={`w-full px-3.5 py-2.5 text-sm bg-[var(--bg-elevated)] hover:bg-[var(--bg-hover)]/60 focus:bg-[var(--bg-surface)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] border border-[var(--border-strong)] focus:border-[var(--border-focus)] rounded-xl transition-all duration-150 focus:outline-none focus:ring-1 focus:ring-[var(--border-focus)] shadow-xs resize-none ${className}`}
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
  xs: 24,
  sm: 32,
  md: 40,
  lg: 48,
  xl: 60,
  '2xl': 76,
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
  const px = typeof size === 'number' ? size : AVATAR_SIZES[size] || 40;
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
          className="w-full h-full rounded-2xl bg-[var(--bg-inverted)] text-[var(--text-inverted)] flex items-center justify-center border border-[var(--border-strong)] shadow-xs"
          aria-hidden="true"
        >
          <svg width={px * 0.48} height={px * 0.48} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 21l-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" />
          </svg>
        </div>
      ) : avatarUrl ? (
        <img
          src={avatarUrl}
          alt={name || 'Avatar'}
          className="w-full h-full rounded-2xl object-cover border border-[var(--border-strong)] bg-[var(--bg-elevated)] shadow-xs"
          referrerPolicy="no-referrer"
        />
      ) : (
        <div
          className="w-full h-full rounded-2xl bg-gradient-to-b from-[var(--bg-elevated)] to-[var(--bg-hover)] text-[var(--text-primary)] font-bold flex items-center justify-center border border-[var(--border-strong)] tracking-tight shadow-xs"
          style={{ fontSize: px * 0.36 }}
          aria-hidden="true"
        >
          {initials || '?'}
        </div>
      )}
      {showPresence && !isSavedMessages && (
        <span
          className={`absolute -bottom-0.5 -right-0.5 rounded-full border-2 border-[var(--bg-surface)] transition-all ${
            isOnline
              ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]'
              : 'bg-neutral-600'
          }`}
          style={{ width: Math.max(9, px * 0.28), height: Math.max(9, px * 0.28) }}
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
  const options = [
    { value: 'light' as const, label: 'Light', icon: Sun },
    { value: 'dark' as const, label: 'Dark', icon: Moon },
    { value: 'system' as const, label: 'Auto', icon: Monitor },
  ];

  return (
    <div className={`flex items-center gap-1 p-1 bg-[var(--bg-elevated)] border border-[var(--border-strong)] rounded-xl shadow-xs ${className}`}>
      {options.map((opt) => {
        const Icon = opt.icon;
        const active = mode === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            title={opt.label}
            className={`flex-1 h-7 px-2.5 text-xs font-medium rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 select-none ${
              active
                ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-sm font-semibold border border-[var(--border-subtle)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
            }`}
          >
            <Icon className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden sm:inline">{opt.label}</span>
          </button>
        );
      })}
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
      className={`flex items-center justify-between gap-4 w-full ${label ? '' : 'w-fit'} ${disabled ? 'opacity-50' : 'cursor-pointer'} select-none group text-left`}
    >
      {(label || description) && (
        <span className="text-left flex-1 min-w-0">
          {label && <span className="block text-sm font-semibold text-[var(--text-primary)] group-hover:opacity-90">{label}</span>}
          {description && <span className="block text-xs text-[var(--text-muted)] mt-0.5">{description}</span>}
        </span>
      )}
      <span
        className={`relative inline-flex h-5.5 w-10 shrink-0 items-center rounded-full border transition-colors duration-200 ${
          checked
            ? 'bg-[var(--bg-inverted)] border-[var(--bg-inverted)]'
            : 'bg-[var(--bg-hover)] border-[var(--border-strong)]'
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full transition-transform duration-200 shadow-sm ${
            checked ? 'translate-x-[20px] bg-[var(--text-inverted)]' : 'translate-x-[3px] bg-[var(--text-muted)]'
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4 sm:p-6"
      onMouseDown={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={`w-full ${sizeMap[size]} max-h-[90vh] flex flex-col bg-[var(--bg-surface)] border border-[var(--border-strong)] rounded-2xl shadow-[var(--shadow-elevated)] scale-in overflow-hidden`}
      >
        {(title || headerRight) && (
          <div className="flex items-center justify-between gap-3 px-6 py-4.5 border-b border-[var(--border-color)] shrink-0 bg-[var(--bg-surface)]">
            <div className="min-w-0">
              {title && <h2 className="text-base font-bold tracking-tight text-[var(--text-primary)] truncate">{title}</h2>}
              {subtitle && <p className="text-xs text-[var(--text-muted)] mt-0.5 truncate">{subtitle}</p>}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {headerRight}
              <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close" className="rounded-xl h-8 w-8">
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
  <div className={`animate-pulse bg-[var(--bg-hover)] rounded-xl ${className}`} />
);

/* ------------------------------ Toasts ------------------------------ */

export const ToastContainer: React.FC = () => {
  const toasts = useUIStore((s) => s.toasts);
  const dismissToast = useUIStore((s) => s.dismissToast);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-5 right-5 z-[60] flex flex-col gap-2.5 w-[calc(100%-2.5rem)] max-w-sm pointer-events-none">
      {toasts.map((toast: Toast) => (
        <button
          key={toast.id}
          type="button"
          onClick={() => dismissToast(toast.id)}
          className="pointer-events-auto text-left toast-enter bg-[var(--bg-surface)]/95 border border-[var(--border-strong)] rounded-2xl shadow-[var(--shadow-elevated)] p-4 cursor-pointer hover:bg-[var(--bg-hover)] transition-all flex items-start gap-3 backdrop-blur-xl"
        >
          {toast.kind === 'success' ? (
            <CheckCircle2 className="w-4.5 h-4.5 text-emerald-400 mt-0.5 shrink-0" />
          ) : toast.kind === 'error' ? (
            <AlertCircle className="w-4.5 h-4.5 text-rose-400 mt-0.5 shrink-0" />
          ) : (
            <Info className="w-4.5 h-4.5 text-[var(--text-secondary)] mt-0.5 shrink-0" />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold text-[var(--text-primary)] truncate">{toast.title}</p>
            {toast.body && <p className="text-xs text-[var(--text-secondary)] mt-0.5 line-clamp-2">{toast.body}</p>}
          </div>
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
  <p className={`text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--text-muted)] select-none ${className}`}>
    {children}
  </p>
);

/* ------------------------- Keyboard shortcut ------------------------- */

export const Kbd: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className = '',
}) => (
  <kbd className={`inline-flex items-center justify-center font-mono text-[10px] px-1.5 py-0.5 rounded-md bg-[var(--bg-elevated)] border border-[var(--border-strong)] text-[var(--text-secondary)] shadow-xs select-none ${className}`}>
    {children}
  </kbd>
);
