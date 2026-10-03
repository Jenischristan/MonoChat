import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronUp,
  KeyRound,
  Lock,
  Mail,
  Palette,
  ShieldCheck,
  Sparkles,
  User,
  UserCheck,
  UserPlus,
  X,
  Zap,
} from 'lucide-react';
import { apiFetch, uploadFileAttachment } from '../../lib/api';
import { CHAT_BACKGROUNDS } from '../../lib/wallpapers';
import { useAuthStore } from '../../stores/auth';
import { useUIStore } from '../../stores/ui';
import type { ThemeMode } from '../../types/messaging';
import {
  Avatar,
  Button,
  Input,
  MonoChatLogo,
  SectionLabel,
  Switch,
  ThemeSwitcher,
  Textarea,
  Kbd,
} from '../ui/DesignSystem';

type Mode = 'login' | 'register' | 'forgot';

interface RegistrationData {
  username: string;
  displayName: string;
  password: string;
  confirmPassword: string;
  bio: string;
  statusText: string;
  title: string;
  pronouns: string;
  phone: string;
  avatarUrl: string | null;
  theme: ThemeMode;
  chatWallpaper: string;
  allowDirectMessages: 'everyone' | 'contacts';
  showOnlineStatus: boolean;
  showReadReceipts: boolean;
  showTypingIndicator: boolean;
  notificationsEnabled: boolean;
  soundEnabled: boolean;
  acceptedGuidelines: boolean;
}

const INITIAL_REGISTRATION: RegistrationData = {
  username: '',
  displayName: '',
  password: '',
  confirmPassword: '',
  bio: '',
  statusText: 'Available',
  title: '',
  pronouns: '',
  phone: '',
  avatarUrl: null,
  theme: 'dark',
  chatWallpaper: 'solid-obsidian',
  allowDirectMessages: 'everyone',
  showOnlineStatus: true,
  showReadReceipts: true,
  showTypingIndicator: true,
  notificationsEnabled: true,
  soundEnabled: true,
  acceptedGuidelines: true,
};

function passwordStrength(pw: string): { score: number; label: string } {
  let score = 0;
  if (pw.length >= 6) score += 1;
  if (pw.length >= 10) score += 1;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score += 1;
  if (/\d/.test(pw)) score += 1;
  if (/[^A-Za-z0-9]/.test(pw)) score += 1;
  const labels = ['Too short', 'Weak', 'Fair', 'Good', 'Strong', 'Secure'];
  return { score, label: labels[Math.min(score, 5)] };
}

export function AuthScreen({ initialMode = 'login' }: { initialMode?: 'login' | 'register' }) {
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const register = useAuthStore((s) => s.register);
  const pushToast = useUIStore((s) => s.pushToast);

  const [mode, setMode] = useState<Mode>(initialMode);
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Registration state
  const [formData, setFormData] = useState<RegistrationData>(INITIAL_REGISTRATION);
  const [showPersonalize, setShowPersonalize] = useState(false);
  const [regError, setRegError] = useState('');
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'ok' | 'taken'>('idle');
  const usernameTimer = useRef<number | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // Forgot password state
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotCode, setForgotCode] = useState('');
  const [forgotNewPassword, setForgotNewPassword] = useState('');
  const [forgotStage, setForgotStage] = useState<'request' | 'reset'>('request');
  const [forgotMessage, setForgotMessage] = useState('');

  const themeMode = useUIStore((s) => s.themeMode);
  const setThemeMode = useUIStore((s) => s.setThemeMode);

  useEffect(() => {
    document.documentElement.classList.toggle('light', themeMode === 'light');
  }, [themeMode]);

  const updateForm = (patch: Partial<RegistrationData>) =>
    setFormData((prev) => ({ ...prev, ...patch }));

  // Live username availability check
  useEffect(() => {
    if (mode !== 'register') return;
    const raw = formData.username.trim().toLowerCase().replace(/^@+/, '');
    if (raw.length < 2) {
      setUsernameStatus('idle');
      return;
    }
    setUsernameStatus('checking');
    if (usernameTimer.current) window.clearTimeout(usernameTimer.current);
    usernameTimer.current = window.setTimeout(async () => {
      try {
        const data = await apiFetch<{ available: boolean }>(
          `/api/auth/check-username?username=${encodeURIComponent(raw)}`,
        );
        setUsernameStatus(data.available ? 'ok' : 'taken');
      } catch {
        setUsernameStatus('idle');
      }
    }, 350);
    return () => {
      if (usernameTimer.current) window.clearTimeout(usernameTimer.current);
    };
  }, [formData.username, mode]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(identifier.trim(), password);
      navigate({ to: '/app' });
    } catch (err: any) {
      setError(err?.message || 'Unable to sign in. Please verify your credentials.');
    } finally {
      setBusy(false);
    }
  };

  const fillDemo = async (username: string) => {
    setIdentifier(username);
    setPassword('monochat');
    setError('');
    setBusy(true);
    try {
      await login(username, 'monochat');
      navigate({ to: '/app' });
    } catch (err: any) {
      setIdentifier(username);
      setPassword('monochat');
      setError('Please click Sign In to authenticate as @' + username);
    } finally {
      setBusy(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegError('');

    const rawUsername = formData.username.trim().toLowerCase().replace(/^@+/, '');
    if (rawUsername.length < 2) {
      setRegError('Username must be at least 2 characters.');
      return;
    }
    if (!/^[a-z0-9_.-]{2,30}$/.test(rawUsername)) {
      setRegError('Username may only contain letters, numbers, dots, and hyphens.');
      return;
    }
    if (usernameStatus === 'taken') {
      setRegError('This handle is already taken. Please choose another.');
      return;
    }
    if (formData.password.length < 6) {
      setRegError('Password must be at least 6 characters.');
      return;
    }
    if (formData.password !== formData.confirmPassword) {
      setRegError('Passwords do not match.');
      return;
    }
    if (!formData.acceptedGuidelines) {
      setRegError('Please accept the community guidelines to continue.');
      return;
    }

    setBusy(true);
    try {
      const displayName = formData.displayName.trim() || rawUsername;
      await register({
        username: rawUsername,
        displayName,
        password: formData.password,
        bio: formData.bio.trim(),
        statusText: formData.statusText.trim() || 'Available',
        title: formData.title.trim(),
        pronouns: formData.pronouns.trim(),
        phone: formData.phone.trim(),
        avatarUrl: formData.avatarUrl,
        theme: formData.theme,
        chatWallpaper: formData.chatWallpaper,
        allowDirectMessages: formData.allowDirectMessages,
        showOnlineStatus: formData.showOnlineStatus,
        showReadReceipts: formData.showReadReceipts,
        showTypingIndicator: formData.showTypingIndicator,
        notificationsEnabled: formData.notificationsEnabled,
        soundEnabled: formData.soundEnabled,
      });
      navigate({ to: '/app' });
    } catch (err: any) {
      setRegError(err?.message || 'Registration failed. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const handleForgotRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const data = await apiFetch<{ message: string; resetCode: string | null }>(
        '/api/auth/forgot-password',
        { method: 'POST', body: JSON.stringify({ email: forgotEmail.trim() }) },
      );
      setForgotMessage(data.message);
      if (data.resetCode) {
        setForgotCode(data.resetCode);
        setForgotStage('reset');
      }
    } catch (err: any) {
      setError(err?.message || 'Recovery request failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleForgotReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await apiFetch('/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ code: forgotCode.trim(), newPassword: forgotNewPassword }),
      });
      pushToast({ kind: 'success', title: 'Password updated', body: 'Please sign in with your new password.' });
      setMode('login');
      setForgotStage('request');
      setForgotMessage('');
    } catch (err: any) {
      setError(err?.message || 'Password reset failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleAvatarUpload = async (file: File) => {
    try {
      const attachment = await uploadFileAttachment(file);
      updateForm({ avatarUrl: attachment.url });
    } catch (err: any) {
      setRegError(err?.message || 'Avatar upload failed.');
    }
  };

  const strength = useMemo(() => passwordStrength(formData.password), [formData.password]);

  return (
    <div className="h-full w-full flex items-center justify-center bg-[var(--bg-canvas)] p-4 sm:p-6 lg:p-8 overflow-y-auto relative bg-grid-monochrome">
      {/* Ambient lighting halo */}
      <div className="absolute inset-0 bg-radial-ambient pointer-events-none" aria-hidden="true" />

      <div className="w-full max-w-5xl grid lg:grid-cols-[1.1fr_1.25fr] gap-0 border border-[var(--border-strong)] rounded-3xl overflow-hidden shadow-[var(--shadow-elevated)] bg-[var(--bg-surface)] relative z-10 backdrop-blur-2xl">
        {/* Brand Left Showcase */}
        <div className="hidden lg:flex flex-col justify-between p-12 border-r border-[var(--border-color)] bg-gradient-to-b from-[var(--bg-surface)] via-[var(--bg-canvas)] to-[var(--bg-surface)] relative overflow-hidden">
          {/* Subtle decorative geometry in top-right */}
          <div
            className="absolute top-0 right-0 w-80 h-80 bg-white/[0.015] rounded-full blur-3xl pointer-events-none -mr-20 -mt-20"
            aria-hidden="true"
          />

          <div>
            <div className="flex items-center gap-3.5">
              <MonoChatLogo size="md" />
              <div>
                <p className="text-xl font-bold tracking-tight text-[var(--text-primary)]">MonoChat</p>
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--text-muted)]">
                  Precision Messaging
                </p>
              </div>
            </div>

            <div className="mt-12 space-y-6">
              <h2 className="text-3xl font-extrabold tracking-tight text-[var(--text-primary)] leading-[1.25]">
                Speed without noise. <br />
                Directness without <br />
                <span className="text-[var(--text-muted)] font-normal">distraction.</span>
              </h2>

              <p className="text-xs text-[var(--text-secondary)] leading-relaxed max-w-sm">
                A high-precision real-time messaging workspace crafted in pure monochrome. Every micro-interaction is tuned for maximum focus and zero cognitive clutter.
              </p>

              {/* Live Preview Card mockup */}
              <div className="mt-8 p-4 rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] shadow-sm space-y-3">
                <div className="flex items-center justify-between pb-2.5 border-b border-[var(--border-subtle)]">
                  <div className="flex items-center gap-2">
                    <Avatar name="Elena Vance" size="xs" isOnline={true} />
                    <div>
                      <p className="text-xs font-bold text-[var(--text-primary)]">Elena Vance</p>
                      <p className="text-[10px] text-emerald-400 font-mono">active now</p>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono text-[var(--text-muted)]">10:42 AM</span>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-start">
                    <div className="max-w-[85%] px-3 py-2 rounded-2xl rounded-tl-sm bg-[var(--bg-surface)] border border-[var(--border-color)] text-xs text-[var(--text-primary)]">
                      The new design system specs are ready for review.
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <div className="max-w-[85%] px-3 py-2 rounded-2xl rounded-tr-sm bg-[var(--bg-inverted)] text-[var(--text-inverted)] text-xs font-medium flex items-center gap-1.5">
                      <span>Shipped. Checked the monochrome contrast ratios.</span>
                      <CheckCheck className="w-3.5 h-3.5 shrink-0 opacity-70" />
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 text-[10px] text-[var(--text-muted)] pt-1">
                  <span className="flex gap-0.5">
                    <span className="typing-dot-1 w-1 h-1 rounded-full bg-[var(--text-muted)]" />
                    <span className="typing-dot-2 w-1 h-1 rounded-full bg-[var(--text-muted)]" />
                    <span className="typing-dot-3 w-1 h-1 rounded-full bg-[var(--text-muted)]" />
                  </span>
                  <span>Elena is typing…</span>
                </div>
              </div>

              {/* Core propositions */}
              <div className="space-y-2.5 pt-2">
                {[
                  'Sub-millisecond WebSocket delivery and live typing status',
                  'Granular group administration and role-based permissions',
                  'Faceted full-text search, media vault and encrypted sessions',
                ].map((text, idx) => (
                  <div key={idx} className="flex items-center gap-2.5 text-xs text-[var(--text-secondary)]">
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--text-primary)] shrink-0" />
                    <span>{text}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-12 pt-6 border-t border-[var(--border-subtle)] flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
              <ShieldCheck className="w-4 h-4 text-[var(--text-secondary)]" />
              <span>Strict privacy &amp; verified sessions</span>
            </div>
            <ThemeSwitcher mode={themeMode} onChange={setThemeMode} />
          </div>
        </div>

        {/* Form Right Panel */}
        <div className="p-7 sm:p-11 flex flex-col justify-center bg-[var(--bg-surface)] min-h-[580px]">
          {/* Mobile brand header */}
          <div className="flex lg:hidden items-center justify-between mb-8 pb-4 border-b border-[var(--border-subtle)]">
            <div className="flex items-center gap-3">
              <MonoChatLogo size="sm" />
              <div>
                <p className="text-base font-bold tracking-tight">MonoChat</p>
                <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Precision Messaging</p>
              </div>
            </div>
            <ThemeSwitcher mode={themeMode} onChange={setThemeMode} />
          </div>

          {/* Mode Switcher Tabs */}
          {mode !== 'forgot' && (
            <div className="flex items-center p-1 bg-[var(--bg-elevated)] border border-[var(--border-strong)] rounded-2xl mb-8 shadow-xs">
              <button
                type="button"
                onClick={() => { setMode('login'); setError(''); setRegError(''); }}
                className={`flex-1 py-2.5 text-xs font-semibold rounded-xl transition-all cursor-pointer ${
                  mode === 'login'
                    ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-sm border border-[var(--border-strong)]'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => { setMode('register'); setError(''); setRegError(''); }}
                className={`flex-1 py-2.5 text-xs font-semibold rounded-xl transition-all cursor-pointer ${
                  mode === 'register'
                    ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-sm border border-[var(--border-strong)]'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
              >
                Create Account
              </button>
            </div>
          )}

          {/* LOGIN FORM */}
          {mode === 'login' && (
            <form onSubmit={handleLogin} className="space-y-5 fade-in-up" data-testid="login-form">
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">Welcome back</h1>
                <p className="text-xs text-[var(--text-muted)] mt-1.5">Sign in to your monochrome workspace.</p>
              </div>

              {error && (
                <div className="p-3.5 rounded-xl border border-rose-500/30 bg-rose-500/10 text-xs font-medium text-rose-300 flex items-center gap-2.5">
                  <X className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <Input
                label="Username or Email"
                placeholder="alice or alice@monochat.local"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                autoComplete="username"
                leftIcon={<User className="w-4 h-4" />}
                required
              />

              <div>
                <Input
                  label="Password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  leftIcon={<Lock className="w-4 h-4" />}
                  required
                />
                <div className="flex justify-end mt-2">
                  <button
                    type="button"
                    onClick={() => { setMode('forgot'); setError(''); }}
                    className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer transition-colors"
                  >
                    Forgot password?
                  </button>
                </div>
              </div>

              <Button type="submit" loading={busy} className="w-full h-11 mt-3">
                Sign In <ArrowRight className="w-4 h-4 ml-2" />
              </Button>

              {/* Fast Testing Demo Accounts */}
              <div className="pt-6 border-t border-[var(--border-subtle)] space-y-3">
                <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
                  <span>Fast testing demo accounts:</span>
                  <Kbd>pass: monochat</Kbd>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {['elena', 'marcus', 'sora'].map((u) => (
                    <button
                      key={u}
                      type="button"
                      onClick={() => fillDemo(u)}
                      className="py-2 px-3 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] hover:bg-[var(--bg-hover)] text-xs font-mono font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all cursor-pointer text-center hover:border-[var(--border-focus)] shadow-xs"
                    >
                      @{u}
                    </button>
                  ))}
                </div>
              </div>
            </form>
          )}

          {/* REGISTRATION FORM */}
          {mode === 'register' && (
            <form onSubmit={handleRegister} className="space-y-4 fade-in-up">
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">Create your account</h1>
                <p className="text-xs text-[var(--text-muted)] mt-1.5">Get started in seconds with your unique handle.</p>
              </div>

              {regError && (
                <div className="p-3.5 rounded-xl border border-rose-500/30 bg-rose-500/10 text-xs font-medium text-rose-300 flex items-center gap-2.5">
                  <X className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>{regError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <Input
                    label="Username"
                    placeholder="handle"
                    value={formData.username}
                    onChange={(e) => updateForm({ username: e.target.value.toLowerCase().replace(/[^a-z0-9_.-]/g, '') })}
                    leftIcon={<User className="w-4 h-4" />}
                    required
                  />
                  <div className="h-4 mt-1 px-1">
                    {usernameStatus === 'checking' && (
                      <span className="text-[10px] text-[var(--text-muted)]">Checking handle…</span>
                    )}
                    {usernameStatus === 'ok' && (
                      <span className="text-[10px] text-emerald-400 flex items-center gap-1 font-medium">
                        <Check className="w-3 h-3" /> Handle available
                      </span>
                    )}
                    {usernameStatus === 'taken' && (
                      <span className="text-[10px] text-rose-400 font-medium">Handle already taken</span>
                    )}
                  </div>
                </div>

                <div>
                  <Input
                    label="Display Name"
                    placeholder="Full name or alias"
                    value={formData.displayName}
                    onChange={(e) => updateForm({ displayName: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <Input
                    label="Password"
                    type="password"
                    placeholder="At least 6 characters"
                    value={formData.password}
                    onChange={(e) => updateForm({ password: e.target.value })}
                    leftIcon={<Lock className="w-4 h-4" />}
                    required
                  />
                  {formData.password && (
                    <div className="flex items-center gap-2 mt-1.5 px-1">
                      <div className="flex-1 h-1 bg-[var(--bg-hover)] rounded-full overflow-hidden flex gap-0.5">
                        {[1, 2, 3, 4, 5].map((level) => (
                          <div
                            key={level}
                            className={`flex-1 h-full transition-colors ${
                              strength.score >= level ? 'bg-[var(--text-primary)]' : 'bg-transparent'
                            }`}
                          />
                        ))}
                      </div>
                      <span className="text-[10px] font-mono text-[var(--text-muted)]">{strength.label}</span>
                    </div>
                  )}
                </div>

                <Input
                  label="Confirm Password"
                  type="password"
                  placeholder="Repeat password"
                  value={formData.confirmPassword}
                  onChange={(e) => updateForm({ confirmPassword: e.target.value })}
                  leftIcon={<Lock className="w-4 h-4" />}
                  required
                />
              </div>

              {/* Collapsible Personalization */}
              <div className="border border-[var(--border-strong)] rounded-2xl p-3.5 bg-[var(--bg-canvas)]">
                <button
                  type="button"
                  onClick={() => setShowPersonalize(!showPersonalize)}
                  className="w-full flex items-center justify-between text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <Palette className="w-4 h-4" /> Personalize Profile &amp; Canvas (Optional)
                  </span>
                  {showPersonalize ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>

                {showPersonalize && (
                  <div className="mt-4 space-y-4 pt-3.5 border-t border-[var(--border-subtle)]">
                    <div className="flex items-center gap-3.5">
                      <Avatar
                        name={formData.displayName || formData.username || '?'}
                        avatarUrl={formData.avatarUrl}
                        size="md"
                        showPresence={false}
                      />
                      <div className="flex-1">
                        <input
                          ref={avatarInputRef}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleAvatarUpload(file);
                          }}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => avatarInputRef.current?.click()}
                        >
                          Upload Avatar Photo
                        </Button>
                      </div>
                    </div>

                    <Input
                      label="Bio / Short Description"
                      placeholder="Product designer, night owl, minimalist..."
                      value={formData.bio}
                      onChange={(e) => updateForm({ bio: e.target.value })}
                    />

                    <div>
                      <SectionLabel className="mb-2">Chat Canvas Wallpaper</SectionLabel>
                      <div className="grid grid-cols-3 gap-2">
                        {CHAT_BACKGROUNDS.slice(0, 6).map((bg) => (
                          <button
                            key={bg.id}
                            type="button"
                            onClick={() => updateForm({ chatWallpaper: bg.id })}
                            className={`p-2 rounded-xl border text-left text-[11px] font-medium transition-all cursor-pointer ${
                              formData.chatWallpaper === bg.id
                                ? 'border-[var(--text-primary)] bg-[var(--bg-elevated)] font-bold text-[var(--text-primary)] shadow-sm'
                                : 'border-[var(--border-strong)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                            }`}
                          >
                            <span className="truncate block">{bg.name}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2.5 pt-1">
                <input
                  type="checkbox"
                  id="guidelines-check"
                  checked={formData.acceptedGuidelines}
                  onChange={(e) => updateForm({ acceptedGuidelines: e.target.checked })}
                  className="w-4 h-4 rounded border-[var(--border-strong)] accent-[var(--text-primary)] cursor-pointer"
                />
                <label htmlFor="guidelines-check" className="text-xs text-[var(--text-secondary)] select-none cursor-pointer">
                  I agree to the community guidelines and terms of service.
                </label>
              </div>

              <Button type="submit" loading={busy} className="w-full h-11 mt-2">
                Create Account <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </form>
          )}

          {/* FORGOT PASSWORD FORM */}
          {mode === 'forgot' && (
            <div className="space-y-5 fade-in-up">
              <button
                type="button"
                onClick={() => { setMode('login'); setError(''); setForgotMessage(''); }}
                className="inline-flex items-center gap-2 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" /> Back to sign in
              </button>

              <div>
                <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">Password Recovery</h1>
                <p className="text-xs text-[var(--text-muted)] mt-1.5">
                  {forgotStage === 'request'
                    ? 'Enter your registered email address or username.'
                    : 'Enter the recovery code and your new password.'}
                </p>
              </div>

              {error && (
                <div className="p-3.5 rounded-xl border border-rose-500/30 bg-rose-500/10 text-xs font-medium text-rose-300 flex items-center gap-2.5">
                  <X className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {forgotMessage && (
                <div className="p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-xs text-[var(--text-secondary)]">
                  {forgotMessage}
                </div>
              )}

              {forgotStage === 'request' ? (
                <form onSubmit={handleForgotRequest} className="space-y-4">
                  <Input
                    label="Username or Email"
                    placeholder="alice or alice@monochat.local"
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    required
                  />
                  <Button type="submit" loading={busy} className="w-full h-11">
                    Generate Recovery Code <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </form>
              ) : (
                <form onSubmit={handleForgotReset} className="space-y-4">
                  <Input
                    label="Recovery Code"
                    value={forgotCode}
                    onChange={(e) => setForgotCode(e.target.value)}
                    required
                  />
                  <Input
                    label="New Password"
                    type="password"
                    placeholder="At least 6 characters"
                    value={forgotNewPassword}
                    onChange={(e) => setForgotNewPassword(e.target.value)}
                    required
                  />
                  <Button type="submit" loading={busy} className="w-full h-11">
                    Set New Password &amp; Sign In
                  </Button>
                </form>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
