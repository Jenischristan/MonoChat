import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Eye,
  Image as ImageIcon,
  Info,
  ShieldCheck,
  UserPlus,
  X,
} from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { uploadFileAttachment } from '../../lib/api';
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
} from '../ui/DesignSystem';

type Mode = 'login' | 'register' | 'forgot';

const TOTAL_STEPS = 6;

const STEP_TITLES = [
  { title: 'Identity', caption: 'Claim your handle' },
  { title: 'Security', caption: 'Protect the account' },
  { title: 'Profile', caption: 'Tell people who you are' },
  { title: 'Look & Feel', caption: 'Avatar and chat canvas' },
  { title: 'Privacy', caption: 'Control your visibility' },
  { title: 'Review', caption: 'Confirm and create' },
];

interface WizardData {
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

const INITIAL_WIZARD: WizardData = {
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
  acceptedGuidelines: false,
};

function passwordStrength(pw: string): { score: number; label: string } {
  let score = 0;
  if (pw.length >= 6) score += 1;
  if (pw.length >= 10) score += 1;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score += 1;
  if (/\d/.test(pw)) score += 1;
  if (/[^A-Za-z0-9]/.test(pw)) score += 1;
  const labels = ['Too short', 'Weak', 'Fair', 'Good', 'Strong', 'Fortress'];
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

  // Forgot password flow
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotCode, setForgotCode] = useState('');
  const [forgotNewPassword, setForgotNewPassword] = useState('');
  const [forgotStage, setForgotStage] = useState<'request' | 'reset'>('request');
  const [forgotMessage, setForgotMessage] = useState('');

  // Registration wizard
  const [step, setStep] = useState(0);
  const [wizard, setWizard] = useState<WizardData>(INITIAL_WIZARD);
  const [stepError, setStepError] = useState('');
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'ok' | 'taken'>('idle');
  const usernameTimer = useRef<number | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const setW = (patch: Partial<WizardData>) => setWizard((w) => ({ ...w, ...patch }));

  const themeMode = useUIStore((s) => s.themeMode);
  const setThemeMode = useUIStore((s) => s.setThemeMode);

  useEffect(() => {
    document.documentElement.classList.toggle('light', themeMode === 'light');
  }, [themeMode]);

  const applyThemePref = (mode: ThemeMode) => {
    setThemeMode(mode);
    setW({ theme: mode });
  };

  /* -------------------- username live availability -------------------- */

  useEffect(() => {
    if (step !== 0) return;
    const raw = wizard.username.trim().toLowerCase().replace(/^@+/, '');
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
    }, 420);
    return () => {
      if (usernameTimer.current) window.clearTimeout(usernameTimer.current);
    };
  }, [wizard.username, step]);

  /* --------------------------- actions --------------------------- */

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(identifier.trim(), password);
      navigate({ to: '/app' });
    } catch (err: any) {
      setError(err?.message || 'Unable to sign in.');
    } finally {
      setBusy(false);
    }
  };

  const validateStep = (target: number): string => {
    if (target > 0 && step === 0) {
      const raw = wizard.username.trim().toLowerCase();
      if (raw.length < 2) return 'Username must be at least 2 characters (a-z, 0-9, ., _, -).';
      if (!/^[a-z0-9_.-]{2,30}$/.test(raw)) return 'Username may only contain a-z, 0-9, dots, underscores and dashes.';
      if (usernameStatus === 'taken') return 'That username is already taken.';
      const display = wizard.displayName.trim();
      if (display.length < 2) return 'Display name must be at least 2 characters.';
    }
    if (target > 1 && step === 1) {
      if (wizard.password.length < 6) return 'Password must be at least 6 characters long.';
      if (wizard.password !== wizard.confirmPassword) return 'Passwords do not match.';
    }
    if (target > TOTAL_STEPS - 1 && step === TOTAL_STEPS - 1) {
      if (!wizard.acceptedGuidelines) return 'Please accept the community guidelines to continue.';
    }
    return '';
  };

  const goToStep = (target: number) => {
    const validationError = validateStep(target);
    if (validationError && target > step) {
      setStepError(validationError);
      return;
    }
    setStepError('');
    setStep(Math.max(0, Math.min(TOTAL_STEPS - 1, target)));
  };

  const handleAvatarUpload = async (file: File) => {
    setStepError('');
    try {
      const attachment = await uploadFileAttachment(file);
      setW({ avatarUrl: attachment.url });
    } catch (err: any) {
      setStepError(err?.message || 'Avatar upload failed.');
    }
  };

  const handleRegister = async () => {
    const validationError = validateStep(TOTAL_STEPS);
    if (validationError) {
      setStepError(validationError);
      return;
    }
    setStepError('');
    setBusy(true);
    try {
      const displayName = wizard.displayName.trim() || wizard.username;
      await register({
        username: wizard.username.trim().toLowerCase(),
        displayName,
        password: wizard.password,
        bio: wizard.bio.trim(),
        statusText: wizard.statusText.trim() || 'Available',
        title: wizard.title.trim(),
        pronouns: wizard.pronouns.trim(),
        phone: wizard.phone.trim(),
        avatarUrl: wizard.avatarUrl,
        theme: wizard.theme,
        chatWallpaper: wizard.chatWallpaper,
        allowDirectMessages: wizard.allowDirectMessages,
        showOnlineStatus: wizard.showOnlineStatus,
        showReadReceipts: wizard.showReadReceipts,
        showTypingIndicator: wizard.showTypingIndicator,
        notificationsEnabled: wizard.notificationsEnabled,
        soundEnabled: wizard.soundEnabled,
      });
      navigate({ to: '/app' });
    } catch (err: any) {
      setStepError(err?.message || 'Registration failed. Please try again.');
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
      pushToast({ kind: 'success', title: 'Password updated', body: 'Sign in with your new password.' });
      setMode('login');
      setForgotStage('request');
      setForgotMessage('');
    } catch (err: any) {
      setError(err?.message || 'Password reset failed.');
    } finally {
      setBusy(false);
    }
  };

  /* --------------------------- rendering --------------------------- */

  const strength = useMemo(() => passwordStrength(wizard.password), [wizard.password]);

  return (
    <div className="h-full w-full flex items-center justify-center bg-[var(--bg-canvas)] p-4 overflow-y-auto">
      <div className="w-full max-w-5xl grid lg:grid-cols-[1fr_1.15fr] gap-0 border border-[var(--border-color)] rounded-xl overflow-hidden shadow-[var(--shadow-panel)] bg-[var(--bg-surface)]">
        {/* Brand panel */}
        <div className="hidden lg:flex flex-col justify-between p-10 border-r border-[var(--border-color)] bg-[var(--bg-canvas)]">
          <div className="flex items-center gap-3">
            <MonoChatLogo size="lg" />
            <div>
              <p className="text-lg font-extrabold tracking-tight text-[var(--text-primary)]">MonoChat</p>
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--text-muted)]">
                Precision monochrome messaging
              </p>
            </div>
          </div>

          <div className="space-y-6">
            <p className="text-2xl font-extrabold leading-snug tracking-tight text-[var(--text-primary)]">
              Every message. <br />
              Zero noise. <br />
              <span className="text-[var(--text-muted)]">Pure black &amp; white.</span>
            </p>
            <div className="space-y-2.5">
              {['Real-time delivery, typing & read receipts', 'Direct chats, groups & granular RBAC', 'Reactions, pins, media & full-text search'].map((line) => (
                <div key={line} className="flex items-center gap-2.5 text-xs text-[var(--text-secondary)]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--text-primary)]" aria-hidden="true" />
                  {line}
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <div className="p-3 rounded-md border border-[var(--border-color)] bg-[var(--bg-surface)]">
              <div className="flex items-start gap-2">
                <Info className="w-3.5 h-3.5 text-[var(--text-muted)] mt-0.5 shrink-0" />
                <p className="text-[11px] leading-relaxed text-[var(--text-muted)]">
                  Demo accounts: <span className="font-mono text-[var(--text-secondary)]">elena</span>,{' '}
                  <span className="font-mono text-[var(--text-secondary)]">marcus</span>,{' '}
                  <span className="font-mono text-[var(--text-secondary)]">sora</span> · password{' '}
                  <span className="font-mono text-[var(--text-secondary)]">monochat</span>
                </p>
              </div>
            </div>
            <ThemeSwitcher mode={themeMode} onChange={applyThemePref} className="w-fit" />
          </div>
        </div>

        {/* Form panel */}
        <div className="p-6 sm:p-10 flex flex-col justify-center bg-[var(--bg-surface)] min-h-[640px]">
          {/* Mobile brand */}
          <div className="flex lg:hidden items-center justify-between mb-6">
            <div className="flex items-center gap-2.5">
              <MonoChatLogo size="md" />
              <p className="text-base font-extrabold tracking-tight">MonoChat</p>
            </div>
            <ThemeSwitcher mode={themeMode} onChange={applyThemePref} />
          </div>

          {mode === 'login' && (
            <form onSubmit={handleLogin} className="space-y-5 fade-in-up" data-testid="login-form">
              <div>
                <h1 className="text-xl font-extrabold tracking-tight text-[var(--text-primary)]">Welcome back</h1>
                <p className="text-xs text-[var(--text-muted)] mt-1">Sign in to your monochrome workspace.</p>
              </div>

              {error && (
                <div className="px-3 py-2.5 rounded-md border border-[var(--text-primary)]/30 bg-[var(--bg-elevated)] text-xs font-medium text-[var(--text-primary)]">
                  {error}
                </div>
              )}

              <Input
                label="Username or email"
                placeholder="you@domain.com"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                autoComplete="username"
                required
              />
              <Input
                label="Password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />

              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => { setMode('forgot'); setError(''); }}
                  className="text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] underline underline-offset-2 cursor-pointer"
                >
                  Forgot password?
                </button>
                <Button type="submit" loading={busy}>
                  Sign in <ArrowRight className="w-3.5 h-3.5" />
                </Button>
              </div>

              <div className="pt-4 border-t border-[var(--border-color)]">
                <p className="text-xs text-[var(--text-muted)]">
                  New here?{' '}
                  <button
                    type="button"
                    onClick={() => { setMode('register'); setStep(0); setStepError(''); }}
                    className="font-bold text-[var(--text-primary)] underline underline-offset-2 cursor-pointer"
                  >
                    Create an account
                  </button>{' '}
                  — a 6-step guided setup.
                </p>
              </div>
            </form>
          )}
          {mode === 'forgot' && (
            <div className="space-y-5 fade-in-up">
              <div>
                <h1 className="text-xl font-extrabold tracking-tight">Password recovery</h1>
                <p className="text-xs text-[var(--text-muted)] mt-1">
                  {forgotStage === 'request'
                    ? 'Enter your email or username — a reset code will be generated.'
                    : 'Enter the reset code and choose a new password.'}
                </p>
              </div>

              {error && (
                <div className="px-3 py-2.5 rounded-md border border-[var(--text-primary)]/30 bg-[var(--bg-elevated)] text-xs font-medium">
                  {error}
                </div>
              )}
              {forgotMessage && forgotStage === 'reset' && (
                <div className="px-3 py-2.5 rounded-md border border-[var(--border-color)] bg-[var(--bg-elevated)] text-xs text-[var(--text-secondary)]">
                  {forgotMessage}
                </div>
              )}

              {forgotStage === 'request' ? (
                <form onSubmit={handleForgotRequest} className="space-y-4">
                  <Input
                    label="Email or username"
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    required
                  />
                  <div className="flex items-center justify-between">
                    <Button type="button" variant="ghost" onClick={() => setMode('login')}>
                      <ArrowLeft className="w-3.5 h-3.5" /> Back
                    </Button>
                    <Button type="submit" loading={busy}>Send reset code</Button>
                  </div>
                </form>
              ) : (
                <form onSubmit={handleForgotReset} className="space-y-4">
                  <Input label="Reset code" value={forgotCode} onChange={(e) => setForgotCode(e.target.value)} required />
                  <Input
                    label="New password"
                    type="password"
                    value={forgotNewPassword}
                    onChange={(e) => setForgotNewPassword(e.target.value)}
                    hint="Minimum 6 characters."
                    required
                  />
                  <div className="flex items-center justify-between">
                    <Button type="button" variant="ghost" onClick={() => setForgotStage('request')}>
                      <ArrowLeft className="w-3.5 h-3.5" /> Back
                    </Button>
                    <Button type="submit" loading={busy}>Reset password</Button>
                  </div>
                </form>
              )}
            </div>
          )}

          {mode === 'register' && (
            <div className="space-y-5 fade-in-up" data-testid="register-wizard">
              {/* Header + progress */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h1 className="text-xl font-extrabold tracking-tight">Create your account</h1>
                    <p className="text-xs text-[var(--text-muted)] mt-0.5">
                      Step {step + 1} of {TOTAL_STEPS} — {STEP_TITLES[step].caption}
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setMode('login')}>
                    Cancel
                  </Button>
                </div>
                <div className="flex items-center gap-1.5">
                  {STEP_TITLES.map((s, i) => (
                    <button
                      key={s.title}
                      type="button"
                      onClick={() => i < step && goToStep(i)}
                      title={s.title}
                      className={`h-1 flex-1 rounded-full transition-colors cursor-pointer ${
                        i < step ? 'bg-[var(--bg-inverted)]' : i === step ? 'bg-[var(--text-secondary)]' : 'bg-[var(--bg-hover)]'
                      } ${i < step ? '' : 'pointer-events-none'}`}
                      aria-label={`Step ${i + 1}: ${s.title}`}
                    />
                  ))}
                </div>
              </div>

              {stepError && (
                <div className="px-3 py-2.5 rounded-md border border-[var(--text-primary)]/30 bg-[var(--bg-elevated)] text-xs font-medium flex items-start gap-2">
                  <X className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />
                  {stepError}
                </div>
              )}

              {/* STEP 1: Identity */}
              {step === 0 && (
                <div className="space-y-4">
                  <SectionLabel>Identity</SectionLabel>
                  <Input
                    label="Username"
                    placeholder="e.g. monochrome_max"
                    value={wizard.username}
                    onChange={(e) => setW({ username: e.target.value })}
                    hint={
                      usernameStatus === 'checking'
                        ? 'Checking availability…'
                        : usernameStatus === 'ok'
                          ? 'Username is available.'
                          : usernameStatus === 'taken'
                            ? 'That username is already taken.'
                            : 'a-z, 0-9, dots, underscores and dashes. 2-30 characters.'
                    }
                    error={usernameStatus === 'taken' ? 'Taken' : undefined}
                    autoFocus
                  />
                  <Input
                    label="Display name"
                    placeholder="How others see you"
                    value={wizard.displayName}
                    onChange={(e) => setW({ displayName: e.target.value })}
                  />
                </div>
              )}

              {/* STEP 2: Security */}
              {step === 1 && (
                <div className="space-y-4">
                  <SectionLabel>Security</SectionLabel>
                  <Input
                    label="Password"
                    type="password"
                    placeholder="At least 6 characters"
                    value={wizard.password}
                    onChange={(e) => setW({ password: e.target.value })}
                  />
                  {wizard.password.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="flex gap-1" aria-hidden="true">
                        {[0, 1, 2, 3, 4].map((i) => (
                          <span
                            key={i}
                            className={`h-1 flex-1 rounded-full transition-colors ${
                              i < strength.score ? 'bg-[var(--bg-inverted)]' : 'bg-[var(--bg-hover)]'
                            }`}
                          />
                        ))}
                      </div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                        Strength: {strength.label}
                      </p>
                    </div>
                  )}
                  <Input
                    label="Confirm password"
                    type="password"
                    placeholder="Repeat your password"
                    value={wizard.confirmPassword}
                    onChange={(e) => setW({ confirmPassword: e.target.value })}
                    error={
                      wizard.confirmPassword && wizard.confirmPassword !== wizard.password
                        ? 'Passwords do not match'
                        : undefined
                    }
                  />
                  <div className="flex items-start gap-2 p-3 rounded-md border border-[var(--border-color)] bg-[var(--bg-elevated)]">
                    <ShieldCheck className="w-4 h-4 text-[var(--text-muted)] shrink-0 mt-0.5" />
                    <p className="text-[11px] leading-relaxed text-[var(--text-muted)]">
                      Passwords are salted and hashed with scrypt on the server. Sessions expire after 30 days
                      and can be revoked from Settings at any time.
                    </p>
                  </div>
                </div>
              )}

              {/* STEP 3: Profile */}
              {step === 2 && (
                <div className="space-y-4">
                  <SectionLabel>Profile</SectionLabel>
                  <Input
                    label="Status"
                    placeholder="Available"
                    value={wizard.statusText}
                    onChange={(e) => setW({ statusText: e.target.value })}
                    maxLength={80}
                  />
                  <Textarea
                    label="Bio"
                    placeholder="A one-liner about you (optional)"
                    value={wizard.bio}
                    onChange={(e) => setW({ bio: e.target.value })}
                    maxLength={240}
                    rows={3}
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <Input label="Role / title" placeholder="Designer…" value={wizard.title} onChange={(e) => setW({ title: e.target.value })} maxLength={80} />
                    <Input label="Pronouns" placeholder="she/her…" value={wizard.pronouns} onChange={(e) => setW({ pronouns: e.target.value })} maxLength={40} />
                  </div>
                  <Input label="Phone (optional)" placeholder="+1 555 000 0000" value={wizard.phone} onChange={(e) => setW({ phone: e.target.value })} maxLength={40} />
                </div>
              )}

              {/* STEP 4: Look & feel */}
              {step === 3 && (
                <div className="space-y-5">
                  <SectionLabel>Look &amp; feel</SectionLabel>
                  <div className="flex items-center gap-4">
                    <Avatar name={wizard.displayName || wizard.username || '?'} avatarUrl={wizard.avatarUrl} size="2xl" showPresence={false} />
                    <div className="space-y-2">
                      <Button variant="outline" size="sm" onClick={() => avatarInputRef.current?.click()} type="button">
                        <ImageIcon className="w-3.5 h-3.5" /> Upload avatar
                      </Button>
                      {wizard.avatarUrl && (
                        <Button variant="ghost" size="sm" onClick={() => setW({ avatarUrl: null })} type="button">
                          <X className="w-3.5 h-3.5" /> Remove
                        </Button>
                      )}
                      <input
                        ref={avatarInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleAvatarUpload(file);
                          e.target.value = '';
                        }}
                      />
                      <p className="text-[10px] text-[var(--text-muted)]">PNG or JPG, up to 25MB.</p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <SectionLabel>Interface theme</SectionLabel>
                    <ThemeSwitcher mode={wizard.theme} onChange={applyThemePref} />
                  </div>

                  <div className="space-y-2">
                    <SectionLabel>Chat canvas</SectionLabel>
                    <div className="grid grid-cols-3 gap-2">
                      {CHAT_BACKGROUNDS.map((bg) => (
                        <button
                          key={bg.id}
                          type="button"
                          onClick={() => setW({ chatWallpaper: bg.id })}
                          className={`group relative h-14 rounded-md overflow-hidden border transition-all cursor-pointer ${
                            wizard.chatWallpaper === bg.id
                              ? 'border-[var(--text-primary)] ring-1 ring-[var(--text-primary)]'
                              : 'border-[var(--border-strong)] hover:border-[var(--text-muted)]'
                          }`}
                          title={bg.name}
                        >
                          {bg.imageUrl ? (
                            <img src={bg.imageUrl} alt={bg.name} className="w-full h-full object-cover" />
                          ) : (
                            <span className="block w-full h-full" style={{ backgroundColor: bg.backgroundColor }} />
                          )}
                          {wizard.chatWallpaper === bg.id && (
                            <span className="absolute inset-0 flex items-center justify-center bg-black/40">
                              <Check className="w-4 h-4 text-white" />
                            </span>
                          )}
                          <span className="absolute bottom-0 inset-x-0 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white bg-black/50 truncate">
                            {bg.name}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 5: Privacy */}
              {step === 4 && (
                <div className="space-y-4">
                  <SectionLabel>Privacy</SectionLabel>
                  <div className="space-y-3.5 p-4 rounded-md border border-[var(--border-color)] bg-[var(--bg-elevated)]">
                    <Switch
                      checked={wizard.showOnlineStatus}
                      onChange={(v) => setW({ showOnlineStatus: v })}
                      label="Show online status"
                      description="Others can see when you are online."
                    />
                    <Switch
                      checked={wizard.showReadReceipts}
                      onChange={(v) => setW({ showReadReceipts: v })}
                      label="Read receipts"
                      description="Show others when you have read their messages."
                    />
                    <Switch
                      checked={wizard.showTypingIndicator}
                      onChange={(v) => setW({ showTypingIndicator: v })}
                      label="Typing indicator"
                      description="Broadcast while you are typing."
                    />
                  </div>
                  <div className="space-y-2 p-4 rounded-md border border-[var(--border-color)] bg-[var(--bg-elevated)]">
                    <SectionLabel>Who can start a chat with you?</SectionLabel>
                    <div className="grid grid-cols-2 gap-2">
                      {(['everyone', 'contacts'] as const).map((policy) => (
                        <button
                          key={policy}
                          type="button"
                          onClick={() => setW({ allowDirectMessages: policy })}
                          className={`h-9 px-3 text-xs font-semibold rounded-md border transition-colors cursor-pointer capitalize ${
                            wizard.allowDirectMessages === policy
                              ? 'bg-[var(--bg-inverted)] text-[var(--text-inverted)] border-transparent'
                              : 'border-[var(--border-strong)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
                          }`}
                        >
                          {policy}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-3 p-4 rounded-md border border-[var(--border-color)] bg-[var(--bg-elevated)]">
                    <Switch
                      checked={wizard.notificationsEnabled}
                      onChange={(v) => setW({ notificationsEnabled: v })}
                      label="In-app notifications"
                      description="Toasts for new messages and invites."
                    />
                    <Switch
                      checked={wizard.soundEnabled}
                      onChange={(v) => setW({ soundEnabled: v })}
                      label="Interface sounds"
                      description="Subtle cues for message events."
                    />
                  </div>
                </div>
              )}

              {/* STEP 6: Review */}
              {step === 5 && (
                <div className="space-y-4">
                  <SectionLabel>Review &amp; commit</SectionLabel>
                  <div className="flex items-center gap-4 p-4 rounded-md border border-[var(--border-color)] bg-[var(--bg-elevated)]">
                    <Avatar name={wizard.displayName || wizard.username || '?'} avatarUrl={wizard.avatarUrl} size="xl" showPresence={false} />
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-[var(--text-primary)] truncate">
                        {wizard.displayName || wizard.username}
                      </p>
                      <p className="text-xs text-[var(--text-muted)] font-mono truncate">@{wizard.username}</p>
                      {wizard.statusText && (
                        <p className="text-xs text-[var(--text-secondary)] mt-1 truncate">{wizard.statusText}</p>
                      )}
                    </div>
                  </div>

                  <dl className="grid grid-cols-2 gap-2 text-xs">
                    {[
                      ['Theme', wizard.theme],
                      ['Canvas', CHAT_BACKGROUNDS.find((b) => b.id === wizard.chatWallpaper)?.name || wizard.chatWallpaper],
                      ['Online status', wizard.showOnlineStatus ? 'Public' : 'Hidden'],
                      ['Read receipts', wizard.showReadReceipts ? 'On' : 'Off'],
                      ['Typing indicator', wizard.showTypingIndicator ? 'On' : 'Off'],
                      ['DM policy', wizard.allowDirectMessages === 'everyone' ? 'Everyone' : 'Contacts only'],
                    ].map(([label, value]) => (
                      <div key={label} className="px-3 py-2 rounded-md border border-[var(--border-color)] bg-[var(--bg-elevated)]">
                        <dt className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">{label}</dt>
                        <dd className="text-[var(--text-primary)] font-semibold capitalize mt-0.5">{value}</dd>
                      </div>
                    ))}
                  </dl>

                  <button
                    type="button"
                    onClick={() => goToStep(0)}
                    className="text-[11px] text-[var(--text-muted)] underline underline-offset-2 hover:text-[var(--text-primary)] cursor-pointer"
                  >
                    Something wrong? Jump back to the first step.
                  </button>

                  <div className="flex items-start gap-2.5 p-3.5 rounded-md border border-[var(--border-strong)] bg-[var(--bg-elevated)]">
                    <input
                      type="checkbox"
                      id="guidelines"
                      checked={wizard.acceptedGuidelines}
                      onChange={(e) => setW({ acceptedGuidelines: e.target.checked })}
                      className="mt-0.5 w-4 h-4 accent-[var(--text-primary)] cursor-pointer"
                    />
                    <label htmlFor="guidelines" className="text-[11px] leading-relaxed text-[var(--text-secondary)] cursor-pointer">
                      I agree to keep it monochrome — be respectful, no harassment or spam, and remember that
                      blocked users cannot contact you.
                    </label>
                  </div>
                </div>
              )}

              {/* Wizard nav */}
              <div className="flex items-center justify-between pt-2">
                <Button
                  variant="ghost"
                  onClick={() => (step === 0 ? setMode('login') : goToStep(step - 1))}
                  type="button"
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> {step === 0 ? 'Back to sign in' : 'Back'}
                </Button>
                {step < TOTAL_STEPS - 1 ? (
                  <Button onClick={() => goToStep(step + 1)} type="button">
                    Continue <ArrowRight className="w-3.5 h-3.5" />
                  </Button>
                ) : (
                  <Button onClick={handleRegister} loading={busy} type="button">
                    <UserPlus className="w-3.5 h-3.5" /> Create account
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Desktop mini footer inside form panel */}
          <div className="hidden lg:flex items-center gap-2 mt-8 text-[10px] text-[var(--text-muted)]">
            <Eye className="w-3 h-3" />
            <span>Strict monochrome design system — no colors were harmed in the making of this app.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
