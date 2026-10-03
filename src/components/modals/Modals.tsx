import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import {
  Check,
  ChevronRight,
  Download,
  FileText,
  Flag,
  Image as ImageIcon,
  KeyRound,
  Link2,
  Lock,
  LogOut,
  Mail,
  MessageSquare,
  Monitor,
  Search,
  Shield as ShieldIcon,
  Sparkles,
  Trash2,
  User as UserIcon,
  Users,
  X,
  Zap,
} from 'lucide-react';
import type { Conversation, Message, ThemeMode, User } from '../../types/messaging';
import { apiFetch } from '../../lib/api';
import { CHAT_BACKGROUNDS } from '../../lib/wallpapers';
import { useAuthStore } from '../../stores/auth';
import { useChatStore } from '../../stores/chat';
import { useUIStore } from '../../stores/ui';
import { formatFullDateTime, getConversationDisplay } from '../../lib/api';
import {
  useConversations,
  useCreateGroup,
  useGlobalSearch,
  useStartDirect,
  useUpdateProfile,
  useUpdateSettings,
  useUserDirectory,
} from '../../queries/hooks';
import {
  Avatar,
  Button,
  Input,
  Kbd,
  Modal,
  SectionLabel,
  Switch,
  Textarea,
  ThemeSwitcher,
} from '../ui/DesignSystem';

/* ------------------------- Global Search Modal ------------------------- */

function GlobalSearchModal() {
  const closeModal = useUIStore((s) => s.closeModal);
  const openModal = useUIStore((s) => s.openModal);
  const currentUser = useAuthStore((s) => s.user)!;
  const startDirect = useStartDirect();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const { data, isFetching } = useGlobalSearch(debounced);

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(query), 220);
    return () => window.clearTimeout(t);
  }, [query]);

  const go = (convId: string, messageId?: string) => {
    if (messageId) useChatStore.getState().setHighlightedMessageId(messageId);
    navigate({ to: '/app/c/$conversationId', params: { conversationId: convId } });
    closeModal();
  };

  const handleStartDirect = (user: User) => {
    startDirect.mutate(user.id, {
      onSuccess: (data) => {
        navigate({ to: '/app/c/$conversationId', params: { conversationId: data.conversation.id } });
        closeModal();
      },
    });
  };

  const hasResults =
    (data?.users.length || 0) + (data?.conversations.length || 0) + (data?.messages.length || 0) > 0;

  return (
    <Modal open onClose={closeModal} size="lg" title="Workspace Search" subtitle="Instantly jump to users, conversations, or messages">
      <div className="p-5 space-y-4">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)] pointer-events-none" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type to search users, conversations, and messages…"
            className="w-full h-11 pl-10 pr-10 text-sm bg-[var(--bg-elevated)] border border-[var(--border-strong)] rounded-xl focus:border-[var(--border-focus)] focus:bg-[var(--bg-surface)] outline-none text-[var(--text-primary)] placeholder:text-[var(--text-muted)] shadow-xs transition-all"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {debounced && isFetching && (
          <p className="text-xs text-[var(--text-muted)] px-1">Searching…</p>
        )}

        {debounced && !hasResults && !isFetching && (
          <div className="py-12 text-center text-xs text-[var(--text-muted)]">
            No results found for “{debounced}”. Try searching for a different keyword.
          </div>
        )}

        {(data?.users.length || 0) > 0 && (
          <div className="space-y-1.5">
            <SectionLabel>Users</SectionLabel>
            {data!.users.slice(0, 6).map((user) => (
              <button
                key={user.id}
                type="button"
                onClick={() => handleStartDirect(user)}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-[var(--bg-hover)] text-left cursor-pointer transition-colors"
              >
                <Avatar name={user.displayName} avatarUrl={user.avatarUrl} size="sm" isOnline={user.isOnline} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-[var(--text-primary)] truncate">{user.displayName}</p>
                  <p className="text-[10px] text-[var(--text-muted)] font-mono truncate">@{user.username}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-[var(--text-muted)]" />
              </button>
            ))}
          </div>
        )}

        {(data?.conversations.length || 0) > 0 && (
          <div className="space-y-1.5">
            <SectionLabel>Conversations</SectionLabel>
            {data!.conversations.slice(0, 6).map((conv) => {
              const display = getConversationDisplay(conv, currentUser.id, new Set(), currentUser);
              return (
                <button
                  key={conv.id}
                  type="button"
                  onClick={() => go(conv.id)}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-[var(--bg-hover)] text-left cursor-pointer transition-colors"
                >
                  <Avatar name={display.title} avatarUrl={display.avatarUrl} size="sm" isSavedMessages={display.isSavedMessages} showPresence={false} />
                  <p className="text-xs font-bold text-[var(--text-primary)] flex-1 truncate text-left">{display.title}</p>
                  <ChevronRight className="w-4 h-4 text-[var(--text-muted)]" />
                </button>
              );
            })}
          </div>
        )}

        {(data?.messages.length || 0) > 0 && (
          <div className="space-y-1.5">
            <SectionLabel>Messages</SectionLabel>
            {data!.messages.slice(0, 10).map((msg) => (
              <button
                key={msg.id}
                type="button"
                onClick={() => go(msg.conversationId, msg.id)}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-[var(--bg-hover)] text-left cursor-pointer transition-colors"
              >
                <div className="w-8 h-8 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] flex items-center justify-center shrink-0">
                  <MessageSquare className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-[var(--text-primary)] truncate font-medium">{msg.content || '📎 Attachment'}</p>
                  <p className="text-[10px] text-[var(--text-muted)] truncate">
                    {msg.senderName} · {formatFullDateTime(msg.createdAt)}
                  </p>
                </div>
                <ChevronRight className="w-4 h-4 text-[var(--text-muted)]" />
              </button>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}

/* ----------------------- New Conversation Modal ----------------------- */

function NewConversationModal({ initialMode = 'direct' }: { initialMode?: 'direct' | 'group' }) {
  const closeModal = useUIStore((s) => s.closeModal);
  const pushToast = useUIStore((s) => s.pushToast);
  const navigate = useNavigate();
  const [mode, setMode] = useState<'direct' | 'group'>(initialMode);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<User[]>([]);
  const [groupName, setGroupName] = useState('');
  const [groupDescription, setGroupDescription] = useState('');
  const [busy, setBusy] = useState(false);

  const { data: users = [], isFetching } = useUserDirectory(search);
  const startDirect = useStartDirect();
  const createGroupMutation = useCreateGroup();

  const createDirect = async (user: User) => {
    setBusy(true);
    try {
      const data = await startDirect.mutateAsync(user.id);
      navigate({ to: '/app/c/$conversationId', params: { conversationId: data.conversation.id } });
      closeModal();
    } catch (err: any) {
      pushToast({ kind: 'error', title: 'Cannot start chat', body: err?.message });
    } finally {
      setBusy(false);
    }
  };

  const createGroup = async () => {
    if (groupName.trim().length < 2) {
      pushToast({ kind: 'error', title: 'Group name must be at least 2 characters.' });
      return;
    }
    setBusy(true);
    try {
      const data = await createGroupMutation.mutateAsync({
        name: groupName.trim(),
        description: groupDescription.trim(),
        memberIds: selected.map((u) => u.id),
      });
      navigate({ to: '/app/c/$conversationId', params: { conversationId: data.conversation.id } });
      closeModal();
    } catch (err: any) {
      pushToast({ kind: 'error', title: 'Group creation failed', body: err?.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={closeModal} title="New Conversation" subtitle="Start a direct chat or assemble a group workspace">
      <div className="p-5 space-y-4">
        {/* Segmented Mode Selector */}
        <div className="flex gap-1 p-1 bg-[var(--bg-elevated)] rounded-xl border border-[var(--border-strong)]">
          {(['direct', 'group'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`flex-1 h-8 text-xs font-semibold rounded-lg transition-all cursor-pointer capitalize ${
                mode === m
                  ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-xs border border-[var(--border-strong)] font-bold'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              {m === 'direct' ? 'Direct chat' : 'Team group'}
            </button>
          ))}
        </div>

        {mode === 'group' && (
          <div className="space-y-3.5">
            <Input
              label="Group Name"
              placeholder="e.g. Design Systems, Project Atlas"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              autoFocus
            />
            <Textarea
              label="Description (optional)"
              placeholder="What is this group about?"
              value={groupDescription}
              onChange={(e) => setGroupDescription(e.target.value)}
              rows={2}
              maxLength={300}
            />
            {selected.length > 0 && (
              <div className="space-y-1.5">
                <SectionLabel>Selected ({selected.length})</SectionLabel>
                <div className="flex flex-wrap gap-1.5">
                  {selected.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => setSelected((s) => s.filter((x) => x.id !== u.id))}
                      className="flex items-center gap-1.5 pl-1.5 pr-2.5 py-1 rounded-full border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-xs font-semibold cursor-pointer hover:bg-[var(--bg-hover)]"
                    >
                      <Avatar name={u.displayName} avatarUrl={u.avatarUrl} size="xs" showPresence={false} />
                      {u.displayName.split(' ')[0]}
                      <X className="w-3 h-3 text-[var(--text-muted)]" />
                    </button>
                  ))}
                </div>
              </div>
            )}
            <Button className="w-full h-10 mt-2" onClick={createGroup} loading={busy} disabled={groupName.trim().length < 2}>
              <Users className="w-4 h-4 mr-2" /> Create Group {selected.length > 0 ? `(${selected.length + 1} members)` : ''}
            </Button>
          </div>
        )}

        <div className="space-y-2 pt-1">
          <SectionLabel>{mode === 'direct' ? 'Pick a person' : 'Add members'}</SectionLabel>
          <Input
            placeholder="Search users by name or handle…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            leftIcon={<Search className="w-3.5 h-3.5" />}
          />
          <div className="max-h-60 overflow-y-auto space-y-0.5 -mx-1 px-1">
            {isFetching && users.length === 0 && (
              <p className="text-xs text-[var(--text-muted)] text-center py-6">Loading directory…</p>
            )}
            {!isFetching && users.length === 0 && (
              <p className="text-xs text-[var(--text-muted)] text-center py-6">No users found.</p>
            )}
            {users.map((user) => {
              const isSelected = selected.some((u) => u.id === user.id);
              return (
                <button
                  key={user.id}
                  type="button"
                  onClick={() => {
                    if (mode === 'direct') {
                      createDirect(user);
                    } else {
                      setSelected((s) =>
                        s.some((u) => u.id === user.id) ? s.filter((u) => u.id !== user.id) : [...s, user],
                      );
                    }
                  }}
                  disabled={busy}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left transition-colors cursor-pointer ${
                    isSelected ? 'bg-[var(--bg-hover)] border border-[var(--border-strong)]' : 'hover:bg-[var(--bg-hover)]'
                  }`}
                >
                  <Avatar name={user.displayName} avatarUrl={user.avatarUrl} size="sm" isOnline={user.isOnline} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-[var(--text-primary)] truncate">{user.displayName}</p>
                    <p className="text-[10px] text-[var(--text-muted)] truncate">
                      @{user.username}
                      {user.statusText ? ` · ${user.statusText}` : ''}
                    </p>
                  </div>
                  {isSelected && <Check className="w-4 h-4 text-[var(--text-primary)]" />}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </Modal>
  );
}

/* ------------------------------ Report Modal ------------------------------ */

function ReportModal(props: {
  targetType: 'user' | 'conversation' | 'message';
  targetId: string;
  targetName?: string;
}) {
  const closeModal = useUIStore((s) => s.closeModal);
  const pushToast = useUIStore((s) => s.pushToast);
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [blockUser, setBlockUser] = useState(false);
  const [busy, setBusy] = useState(false);

  const reasons = ['Spam or scams', 'Harassment or bullying', 'Hate speech', 'Illegal content', 'Impersonation', 'Other'];

  const submit = async () => {
    if (!reason) {
      pushToast({ kind: 'error', title: 'Please select a reason for the report.' });
      return;
    }
    setBusy(true);
    try {
      await apiFetch('/api/users/report', {
        method: 'POST',
        body: JSON.stringify({
          targetType: props.targetType,
          targetId: props.targetId,
          targetUserId: props.targetType === 'user' ? props.targetId : null,
          reason,
          details,
          blockUser,
        }),
      });
      pushToast({ kind: 'success', title: 'Report submitted', body: 'Our moderation team will review this.' });
      closeModal();
    } catch (err: any) {
      pushToast({ kind: 'error', title: 'Report failed', body: err?.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={closeModal} title="Submit Report" subtitle={props.targetName}>
      <div className="p-5 space-y-4">
        <div className="space-y-1.5">
          <SectionLabel>Reason</SectionLabel>
          <div className="space-y-1">
            {reasons.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setReason(r)}
                className={`w-full flex items-center justify-between px-3.5 py-2 text-xs font-semibold rounded-xl border transition-colors cursor-pointer ${
                  reason === r
                    ? 'border-[var(--text-primary)] bg-[var(--bg-hover)]'
                    : 'border-[var(--border-strong)] hover:bg-[var(--bg-hover)]'
                }`}
              >
                {r}
                {reason === r && <Check className="w-4 h-4" />}
              </button>
            ))}
          </div>
        </div>
        <Textarea
          label="Additional details (optional)"
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          rows={3}
          maxLength={2000}
        />
        {props.targetType === 'user' && (
          <Switch
            checked={blockUser}
            onChange={setBlockUser}
            label="Also block this user"
            description="They will no longer be able to message you."
          />
        )}
        <div className="flex items-center gap-2.5 p-3 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)]">
          <Flag className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
          <p className="text-xs text-[var(--text-muted)] leading-relaxed">
            Reports are handled with strict privacy.
          </p>
        </div>
        <Button className="w-full h-10" onClick={submit} loading={busy} disabled={!reason}>
          Submit Report
        </Button>
      </div>
    </Modal>
  );
}

/* ----------------------------- Forward Modal ----------------------------- */

function ForwardMessageModal({ message }: { message: Message }) {
  const closeModal = useUIStore((s) => s.closeModal);
  const navigate = useNavigate();
  const pushToast = useUIStore((s) => s.pushToast);
  const { data: conversations = [] } = useConversations();
  const [busyId, setBusyId] = useState<string | null>(null);

  const forward = async (conv: Conversation) => {
    setBusyId(conv.id);
    try {
      await apiFetch(`/api/conversations/${conv.id}/messages`, {
        method: 'POST',
        body: JSON.stringify({ content: message.content, forwardedFromId: message.senderId }),
      });
      pushToast({ kind: 'success', title: 'Message forwarded' });
      navigate({ to: '/app/c/$conversationId', params: { conversationId: conv.id } });
      closeModal();
    } catch (err: any) {
      pushToast({ kind: 'error', title: 'Forward failed', body: err?.message });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Modal open onClose={closeModal} title="Forward Message" subtitle={message.content.slice(0, 80) || 'Attachment message'}>
      <div className="p-4 space-y-1 max-h-96 overflow-y-auto">
        {conversations.map((conv) => {
          const display = getConversationDisplay(conv, useAuthStore.getState().user?.id || '', new Set());
          return (
            <button
              key={conv.id}
              type="button"
              onClick={() => forward(conv)}
              disabled={busyId === conv.id}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-[var(--bg-hover)] text-left cursor-pointer disabled:opacity-50"
            >
              <Avatar name={display.title} avatarUrl={display.avatarUrl} size="sm" isSavedMessages={display.isSavedMessages} showPresence={false} />
              <p className="text-xs font-bold text-[var(--text-primary)] flex-1 truncate">{display.title}</p>
              <ChevronRight className="w-4 h-4 text-[var(--text-muted)]" />
            </button>
          );
        })}
      </div>
    </Modal>
  );
}

/* ----------------------------- Lightbox ----------------------------- */

function ImageLightboxModal({ url, fileName }: { url: string; fileName?: string }) {
  const closeModal = useUIStore((s) => s.closeModal);
  return (
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-xl flex items-center justify-center p-4" onClick={closeModal}>
      <button
        type="button"
        onClick={closeModal}
        className="absolute top-5 right-5 p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white cursor-pointer transition-colors"
        aria-label="Close"
      >
        <X className="w-5 h-5" />
      </button>
      <div className="max-w-[90vw] max-h-[85vh] flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
        <img src={url} alt={fileName || 'Attachment'} className="max-w-full max-h-[78vh] object-contain rounded-2xl shadow-2xl border border-white/10" />
        <div className="flex items-center justify-between w-full mt-4 text-xs text-white/80 px-2">
          <span className="truncate max-w-xs">{fileName}</span>
          <a
            href={`${url}${url.includes('?') ? '&' : '?'}download=1`}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 text-white cursor-pointer transition-colors"
            download
          >
            <Download className="w-4 h-4" /> Download
          </a>
        </div>
      </div>
    </div>
  );
}

/* ----------------------------- Settings Modal ----------------------------- */

const SETTINGS_TABS = [
  { id: 'profile', label: 'Profile', icon: UserIcon },
  { id: 'appearance', label: 'Appearance', icon: ImageIcon },
  { id: 'notifications', label: 'Notifications', icon: Monitor },
  { id: 'privacy', label: 'Privacy', icon: ShieldIcon },
  { id: 'sessions', label: 'Sessions', icon: Monitor },
  { id: 'account', label: 'Account', icon: ShieldIcon },
];

function SettingsModal({ initialTab }: { initialTab?: string }) {
  const closeModal = useUIStore((s) => s.closeModal);
  const pushToast = useUIStore((s) => s.pushToast);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const currentUser = useAuthStore((s) => s.user)!;
  const setUser = useAuthStore((s) => s.setUser);

  const themeMode = useUIStore((s) => s.themeMode);
  const setThemeMode = useUIStore((s) => s.setThemeMode);
  const chatBackground = useUIStore((s) => s.chatBackground);
  const setChatBackground = useUIStore((s) => s.setChatBackground);

  const [tab, setTab] = useState(initialTab || 'profile');
  const [busy, setBusy] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // Profile form
  const [displayName, setDisplayName] = useState(currentUser.displayName);
  const [username, setUsername] = useState(currentUser.username);
  const [bio, setBio] = useState(currentUser.bio);
  const [statusText, setStatusText] = useState(currentUser.statusText);
  const [phone, setPhone] = useState(currentUser.phone || '');
  const [pronouns, setPronouns] = useState(currentUser.pronouns || '');
  const [title, setTitle] = useState(currentUser.title || '');
  const [location, setLocation] = useState(currentUser.location || '');
  const [website, setWebsite] = useState(currentUser.website || '');

  // Security
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [email, setEmail] = useState(currentUser.email);
  const [emailPassword, setEmailPassword] = useState('');
  const [deletePassword, setDeletePassword] = useState('');

  const updateProfile = useUpdateProfile();
  const updateSettings = useUpdateSettings();

  const settings = currentUser.settings;

  const applySettings = (patch: Record<string, unknown>) => {
    updateSettings.mutate(patch);
  };

  const saveProfile = async () => {
    setBusy(true);
    try {
      await updateProfile.mutateAsync({
        displayName,
        username: username.trim().toLowerCase(),
        bio,
        statusText,
        phone,
        pronouns,
        title,
        location,
        website,
      });
      pushToast({ kind: 'success', title: 'Profile updated' });
    } catch (err: any) {
      pushToast({ kind: 'error', title: 'Update failed', body: err?.message });
    } finally {
      setBusy(false);
    }
  };

  const uploadAvatar = async (file: File) => {
    try {
      const attachment = await apiFetch<{ attachment: { url: string } }>('/api/files/upload', {
        method: 'POST',
        body: (() => {
          const fd = new FormData();
          fd.append('file', file);
          return fd;
        })(),
      });
      await updateProfile.mutateAsync({ avatarUrl: attachment.attachment.url });
      pushToast({ kind: 'success', title: 'Avatar updated' });
    } catch (err: any) {
      pushToast({ kind: 'error', title: 'Avatar upload failed', body: err?.message });
    }
  };

  const changePassword = async () => {
    setBusy(true);
    try {
      await apiFetch('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      pushToast({ kind: 'success', title: 'Password changed' });
      setCurrentPassword('');
      setNewPassword('');
    } catch (err: any) {
      pushToast({ kind: 'error', title: 'Password change failed', body: err?.message });
    } finally {
      setBusy(false);
    }
  };

  const changeEmail = async () => {
    setBusy(true);
    try {
      await apiFetch('/api/users/me/email', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim(), password: emailPassword }),
      });
      pushToast({ kind: 'success', title: 'Email updated' });
      setEmailPassword('');
    } catch (err: any) {
      pushToast({ kind: 'error', title: 'Email change failed', body: err?.message });
    } finally {
      setBusy(false);
    }
  };

  const deleteAccount = async () => {
    if (!window.confirm('Permanently delete your account and all conversations? This cannot be undone.')) return;
    setBusy(true);
    try {
      await apiFetch('/api/users/me', {
        method: 'DELETE',
        body: JSON.stringify({ password: deletePassword }),
      });
      await logout();
      navigate({ to: '/login' });
    } catch (err: any) {
      pushToast({ kind: 'error', title: 'Deletion failed', body: err?.message });
    } finally {
      setBusy(false);
    }
  };

  const [sessions, setSessions] = useState<any[]>([]);
  useEffect(() => {
    if (tab !== 'sessions') return;
    apiFetch<{ sessions: any[] }>('/api/auth/sessions').then((d) => setSessions(d.sessions)).catch(() => undefined);
  }, [tab]);

  const revokeSession = async (id: string) => {
    try {
      await apiFetch(`/api/auth/sessions/${id}`, { method: 'DELETE' });
      setSessions((list) => list.filter((x) => x.id !== id));
    } catch {
      // ignore
    }
  };

  const exportData = async () => {
    try {
      const data = await apiFetch('/api/users/me/export');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `monochat-export-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      pushToast({ kind: 'error', title: 'Export failed' });
    }
  };

  const clearAllChats = async () => {
    try {
      await apiFetch('/api/users/me/clear-all-chats', { method: 'POST' });
      pushToast({ kind: 'success', title: 'All chats cleared' });
      window.location.reload();
    } catch {
      pushToast({ kind: 'error', title: 'Clear failed' });
    }
  };

  return (
    <Modal open onClose={closeModal} size="lg" title="Workspace Settings" subtitle="Profile, appearance, privacy, and account security" headerRight={<span />}>
      <div className="flex flex-col sm:flex-row min-h-[500px]">
        {/* Sidebar Tabs */}
        <div className="sm:w-52 border-b sm:border-b-0 sm:border-r border-[var(--border-color)] p-3 shrink-0 space-y-1 bg-[var(--bg-elevated)]/50">
          {SETTINGS_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold rounded-xl transition-all cursor-pointer ${
                tab === t.id
                  ? 'bg-[var(--bg-inverted)] text-[var(--text-inverted)] shadow-xs'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
              }`}
            >
              <t.icon className="w-4 h-4 shrink-0" />
              <span>{t.label}</span>
            </button>
          ))}
        </div>

        {/* Content Area */}
        <div className="flex-1 p-5 space-y-5 overflow-y-auto max-h-[65vh]">
          {tab === 'profile' && (
            <>
              <div className="flex items-center gap-4 pb-4 border-b border-[var(--border-subtle)]">
                <Avatar name={currentUser.displayName} avatarUrl={currentUser.avatarUrl} size="2xl" showPresence={false} />
                <div className="space-y-2">
                  <Button size="sm" variant="outline" onClick={() => avatarInputRef.current?.click()}>
                    Upload Avatar
                  </Button>
                  {currentUser.avatarUrl && (
                    <Button size="sm" variant="ghost" onClick={() => updateProfile.mutate({ avatarUrl: null })}>
                      Remove
                    </Button>
                  )}
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) uploadAvatar(f);
                      e.target.value = '';
                    }}
                  />
                </div>
              </div>
              <div className="grid sm:grid-cols-2 gap-3.5">
                <Input label="Display name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
                <Input label="Username" value={username} onChange={(e) => setUsername(e.target.value)} />
                <Input label="Status" value={statusText} onChange={(e) => setStatusText(e.target.value)} />
                <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
                <Input label="Pronouns" value={pronouns} onChange={(e) => setPronouns(e.target.value)} />
                <Input label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
                <Input label="Location" value={location} onChange={(e) => setLocation(e.target.value)} />
                <Input label="Website" value={website} onChange={(e) => setWebsite(e.target.value)} />
              </div>
              <Textarea label="Bio" value={bio} onChange={(e) => setBio(e.target.value)} rows={3} maxLength={300} />
              <Button onClick={saveProfile} loading={busy} className="h-10">Save Profile</Button>
            </>
          )}

          {tab === 'appearance' && (
            <>
              <div className="space-y-2">
                <SectionLabel>Theme</SectionLabel>
                <ThemeSwitcher mode={themeMode} onChange={setThemeMode} />
              </div>
              <div className="space-y-2">
                <SectionLabel>Chat Canvas Wallpaper</SectionLabel>
                <div className="grid grid-cols-3 gap-2.5">
                  {CHAT_BACKGROUNDS.map((bg) => (
                    <button
                      key={bg.id}
                      type="button"
                      onClick={() => setChatBackground(bg.id)}
                      className={`relative h-20 rounded-xl overflow-hidden border transition-all cursor-pointer ${
                        chatBackground === bg.id
                          ? 'border-[var(--text-primary)] ring-2 ring-[var(--text-primary)]'
                          : 'border-[var(--border-strong)] hover:border-[var(--text-muted)]'
                      }`}
                    >
                      {bg.imageUrl ? (
                        <img src={bg.imageUrl} alt={bg.name} className="w-full h-full object-cover" />
                      ) : (
                        <span className="block w-full h-full" style={{ backgroundColor: bg.backgroundColor }} />
                      )}
                      <span className="absolute bottom-0 inset-x-0 px-2 py-1 text-[10px] font-bold uppercase text-white bg-black/60 truncate">
                        {bg.name}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-4 pt-3 border-t border-[var(--border-subtle)]">
                <Switch
                  checked={settings?.compactMode ?? false}
                  onChange={(v) => applySettings({ compactMode: v })}
                  label="Compact mode"
                  description="Tighter spacing in the chat stream."
                />
                <div className="space-y-1.5">
                  <SectionLabel>Font size</SectionLabel>
                  <div className="flex gap-2">
                    {(['small', 'medium', 'large'] as const).map((fs) => (
                      <button
                        key={fs}
                        type="button"
                        onClick={() => applySettings({ fontSize: fs })}
                        className={`flex-1 h-8 text-xs font-semibold rounded-xl border capitalize cursor-pointer ${
                          (settings?.fontSize || 'medium') === fs
                            ? 'bg-[var(--bg-inverted)] text-[var(--text-inverted)] border-transparent shadow-xs'
                            : 'border-[var(--border-strong)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
                        }`}
                      >
                        {fs}
                      </button>
                    ))}
                  </div>
                </div>
                <Switch
                  checked={settings?.enterToSend ?? true}
                  onChange={(v) => applySettings({ enterToSend: v })}
                  label="Enter to send"
                  description="Press Enter to send, Shift+Enter for a new line."
                />
              </div>
            </>
          )}

          {tab === 'notifications' && (
            <div className="space-y-4">
              <Switch
                checked={settings?.notificationsEnabled ?? true}
                onChange={(v) => applySettings({ notificationsEnabled: v })}
                label="In-app notifications"
                description="Toast banners for incoming messages and invitations."
              />
              <Switch
                checked={settings?.soundEnabled ?? true}
                onChange={(v) => applySettings({ soundEnabled: v })}
                label="Interface sounds"
                description="Play subtle audio cues for message events."
              />
              <Switch
                checked={settings?.desktopNotifications ?? false}
                onChange={(v) => {
                  applySettings({ desktopNotifications: v });
                  if (v && 'Notification' in window) {
                    Notification.requestPermission().catch(() => undefined);
                  }
                }}
                label="Desktop notifications"
                description="Receive system notifications when the window is inactive."
              />
              <Switch
                checked={settings?.messagePreview ?? true}
                onChange={(v) => applySettings({ messagePreview: v })}
                label="Message preview"
                description="Show message text snippet inside notification banners."
              />
            </div>
          )}

          {tab === 'privacy' && (
            <div className="space-y-4">
              <Switch
                checked={settings?.showOnlineStatus ?? true}
                onChange={(v) => applySettings({ showOnlineStatus: v })}
                label="Show online status"
                description="Allow other users to see your real-time presence."
              />
              <Switch
                checked={settings?.showReadReceipts ?? true}
                onChange={(v) => applySettings({ showReadReceipts: v })}
                label="Read receipts"
                description="Send confirmation when you read received messages."
              />
              <Switch
                checked={settings?.showTypingIndicator ?? true}
                onChange={(v) => applySettings({ showTypingIndicator: v })}
                label="Typing indicator"
                description="Broadcast typing status while composing."
              />
              <div className="space-y-2 pt-2 border-t border-[var(--border-subtle)]">
                <SectionLabel>Direct messages policy</SectionLabel>
                <div className="grid grid-cols-2 gap-2">
                  {(['everyone', 'contacts'] as const).map((policy) => (
                    <button
                      key={policy}
                      type="button"
                      onClick={() => applySettings({ allowDirectMessages: policy })}
                      className={`h-9 text-xs font-semibold rounded-xl border capitalize cursor-pointer ${
                        (settings?.allowDirectMessages || 'everyone') === policy
                          ? 'bg-[var(--bg-inverted)] text-[var(--text-inverted)] border-transparent shadow-xs'
                          : 'border-[var(--border-strong)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
                      }`}
                    >
                      {policy}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {tab === 'sessions' && (
            <div className="space-y-2.5">
              <SectionLabel>Active Sessions</SectionLabel>
              {sessions.map((session) => (
                <div
                  key={session.id}
                  className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)]"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-bold text-[var(--text-primary)] truncate">{session.userAgent}</p>
                      {session.isCurrent && (
                        <span className="text-[9px] font-bold uppercase px-1.5 py-0.2 rounded bg-[var(--bg-inverted)] text-[var(--text-inverted)]">
                          Current
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-[var(--text-muted)] font-mono mt-0.5">
                      Last active {formatFullDateTime(session.lastActiveAt)}
                    </p>
                  </div>
                  {!session.isCurrent && (
                    <Button variant="ghost" size="xs" onClick={() => revokeSession(session.id)}>
                      <X className="w-3.5 h-3.5" /> Revoke
                    </Button>
                  )}
                </div>
              ))}
              {sessions.length === 0 && <p className="text-xs text-[var(--text-muted)]">Loading sessions…</p>}
            </div>
          )}

          {tab === 'account' && (
            <div className="space-y-5">
              <div className="space-y-3">
                <SectionLabel>Change email</SectionLabel>
                <Input label="New email" value={email} onChange={(e) => setEmail(e.target.value)} />
                <Input
                  label="Confirm with current password"
                  type="password"
                  value={emailPassword}
                  onChange={(e) => setEmailPassword(e.target.value)}
                />
                <Button variant="secondary" onClick={changeEmail} loading={busy} disabled={!emailPassword}>
                  Update Email
                </Button>
              </div>

              <div className="space-y-3 pt-4 border-t border-[var(--border-subtle)]">
                <SectionLabel>Change password</SectionLabel>
                <Input
                  label="Current password"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                />
                <Input
                  label="New password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  hint="Minimum 6 characters."
                />
                <Button variant="secondary" onClick={changePassword} loading={busy} disabled={!currentPassword || newPassword.length < 6}>
                  Change Password
                </Button>
              </div>

              <div className="space-y-3 pt-4 border-t border-[var(--border-subtle)]">
                <SectionLabel>Your data</SectionLabel>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={exportData}>
                    <Download className="w-3.5 h-3.5 mr-1.5" /> Export Data (JSON)
                  </Button>
                  <Button variant="outline" onClick={clearAllChats}>
                    <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Clear All Chats
                  </Button>
                </div>
              </div>

              <div className="space-y-3 pt-4 border-t border-[var(--border-subtle)]">
                <SectionLabel>Danger zone</SectionLabel>
                <Input
                  label="Confirm password to delete account"
                  type="password"
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                />
                <Button variant="danger" onClick={deleteAccount} loading={busy} disabled={!deletePassword}>
                  <LogOut className="w-3.5 h-3.5 mr-1.5" /> Permanently Delete Account
                </Button>
                <Button
                  variant="ghost"
                  className="w-full mt-2"
                  onClick={async () => {
                    await logout();
                    navigate({ to: '/login' });
                  }}
                >
                  Sign Out
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

/* ------------------------------- Modal host ------------------------------- */

export function ModalHost() {
  const modal = useUIStore((s) => s.modal);

  switch (modal.kind) {
    case 'settings':
      return <SettingsModal initialTab={modal.initialTab} />;
    case 'search':
      return <GlobalSearchModal />;
    case 'new-chat':
      return <NewConversationModal initialMode={modal.initialMode} />;
    case 'report':
      return <ReportModal targetType={modal.targetType} targetId={modal.targetId} targetName={modal.targetName} />;
    case 'forward':
      return <ForwardMessageModal message={modal.message} />;
    case 'lightbox':
      return <ImageLightboxModal url={modal.url} fileName={modal.fileName} />;
    default:
      return null;
  }
}
