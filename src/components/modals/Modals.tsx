import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import {
  Check,
  ChevronRight,
  Download,
  Flag,
  Image as ImageIcon,
  Link2,
  LogOut,
  Monitor,
  Search,
  Shield as ShieldIcon,
  Trash2,
  User as UserIcon,
  Users,
  X,
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
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const { data, isFetching } = useGlobalSearch(debounced);

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(query), 260);
    return () => window.clearTimeout(t);
  }, [query]);

  const go = (convId: string, messageId?: string) => {
    if (messageId) useChatStore.getState().setHighlightedMessageId(messageId);
    navigate({ to: '/app/c/$conversationId', params: { conversationId: convId } });
    closeModal();
  };

  const hasResults =
    (data?.users.length || 0) + (data?.conversations.length || 0) + (data?.messages.length || 0) > 0;

  return (
    <Modal open onClose={closeModal} size="lg" title="Search" subtitle="Users, conversations and messages">
      <div className="p-4 space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type to search everything…"
            className="w-full h-10 pl-10 pr-3 text-sm bg-[var(--bg-elevated)] border border-[var(--border-strong)] rounded-md focus:border-[var(--border-focus)] outline-none text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
          />
        </div>

        {debounced && isFetching && <p className="text-xs text-[var(--text-muted)]">Searching…</p>}

        {debounced && !hasResults && !isFetching && (
          <p className="text-xs text-[var(--text-muted)] text-center py-6">No results for “{debounced}”.</p>
        )}

        {(data?.users.length || 0) > 0 && (
          <div className="space-y-1.5">
            <SectionLabel>Users</SectionLabel>
            {data!.users.slice(0, 6).map((user) => (
              <button
                key={user.id}
                type="button"
                onClick={() => {
                  startDirectFor(user, navigate, closeModal);
                }}
                className="w-full flex items-center gap-3 px-2.5 py-2 rounded-md hover:bg-[var(--bg-hover)] text-left cursor-pointer"
              >
                <Avatar name={user.displayName} avatarUrl={user.avatarUrl} size="sm" isOnline={user.isOnline} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold truncate">{user.displayName}</p>
                  <p className="text-[10px] text-[var(--text-muted)] font-mono truncate">@{user.username}</p>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-[var(--text-muted)]" />
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
                  className="w-full flex items-center gap-3 px-2.5 py-2 rounded-md hover:bg-[var(--bg-hover)] text-left cursor-pointer"
                >
                  <Avatar name={display.title} avatarUrl={display.avatarUrl} size="sm" isSavedMessages={display.isSavedMessages} showPresence={false} />
                  <p className="text-xs font-bold flex-1 truncate text-left">{display.title}</p>
                  <ChevronRight className="w-3.5 h-3.5 text-[var(--text-muted)]" />
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
                className="w-full flex items-center gap-3 px-2.5 py-2 rounded-md hover:bg-[var(--bg-hover)] text-left cursor-pointer"
              >
                <Avatar name={msg.senderName} avatarUrl={msg.senderAvatar} size="sm" showPresence={false} />
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-bold text-[var(--text-secondary)]">
                    {msg.senderName} · {msg.conversationName}
                  </p>
                  <p className="text-xs text-[var(--text-primary)] line-clamp-1">{msg.content}</p>
                </div>
                <span className="text-[10px] text-[var(--text-muted)] shrink-0">
                  {formatFullDateTime(msg.createdAt)}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}

async function startDirectFor(
  user: User,
  navigate: ReturnType<typeof useNavigate>,
  closeModal: () => void,
) {
  const data = await apiFetch<{ conversation: Conversation }>('/api/conversations/direct', {
    method: 'POST',
    body: JSON.stringify({ targetUserId: user.id }),
  });
  navigate({ to: '/app/c/$conversationId', params: { conversationId: data.conversation.id } });
  closeModal();
}

/* ------------------------- New Conversation Modal ------------------------- */

function NewConversationModal({ initialMode }: { initialMode?: 'direct' | 'group' }) {
  const closeModal = useUIStore((s) => s.closeModal);
  const navigate = useNavigate();
  const pushToast = useUIStore((s) => s.pushToast);
  const [mode, setMode] = useState<'direct' | 'group'>(initialMode || 'direct');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<User[]>([]);
  const [groupName, setGroupName] = useState('');
  const [groupDescription, setGroupDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const { data: users = [], isFetching } = useUserDirectory(search);

  const createDirect = async (user: User) => {
    setBusy(true);
    try {
      const data = await apiFetch<{ conversation: Conversation }>('/api/conversations/direct', {
        method: 'POST',
        body: JSON.stringify({ targetUserId: user.id }),
      });
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
      const data = await apiFetch<{ conversation: Conversation }>('/api/groups', {
        method: 'POST',
        body: JSON.stringify({
          name: groupName.trim(),
          description: groupDescription.trim(),
          memberIds: selected.map((u) => u.id),
        }),
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
    <Modal open onClose={closeModal} title="New conversation" subtitle="Start a direct chat or assemble a group">
      <div className="p-4 space-y-4">
        <div className="flex gap-0.5 p-0.5 bg-[var(--bg-elevated)] rounded-md border border-[var(--border-strong)]">
          {(['direct', 'group'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`flex-1 h-8 text-xs font-bold rounded transition-colors cursor-pointer capitalize ${
                mode === m ? 'bg-[var(--bg-inverted)] text-[var(--text-inverted)]' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              {m === 'direct' ? 'Direct chat' : 'Group'}
            </button>
          ))}
        </div>

        {mode === 'group' && (
          <div className="space-y-3">
            <Input
              label="Group name"
              placeholder="e.g. Monochrome HQ"
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
              <div className="flex flex-wrap gap-1.5">
                {selected.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => setSelected((s) => s.filter((x) => x.id !== u.id))}
                    className="flex items-center gap-1.5 pl-1 pr-2 py-0.5 rounded-full border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-xs font-semibold cursor-pointer hover:bg-[var(--bg-hover)]"
                  >
                    <Avatar name={u.displayName} avatarUrl={u.avatarUrl} size="xs" showPresence={false} />
                    {u.displayName.split(' ')[0]}
                    <X className="w-3 h-3 text-[var(--text-muted)]" />
                  </button>
                ))}
              </div>
            )}
            <Button className="w-full" onClick={createGroup} loading={busy} disabled={groupName.trim().length < 2}>
              <Users className="w-3.5 h-3.5" /> Create group {selected.length > 0 ? `with ${selected.length}` : ''}
            </Button>
          </div>
        )}

        <div className="space-y-2">
          <SectionLabel>{mode === 'direct' ? 'Pick a person' : 'Add members'}</SectionLabel>
          <Input
            placeholder="Search users…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            leftIcon={<Search className="w-3.5 h-3.5" />}
          />
          <div className="max-h-64 overflow-y-auto space-y-0.5 -mx-1 px-1">
            {isFetching && users.length === 0 && (
              <p className="text-xs text-[var(--text-muted)] text-center py-4">Loading users…</p>
            )}
            {!isFetching && users.length === 0 && (
              <p className="text-xs text-[var(--text-muted)] text-center py-4">No users found.</p>
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
                  className={`w-full flex items-center gap-3 px-2.5 py-2 rounded-md text-left transition-colors cursor-pointer ${
                    isSelected ? 'bg-[var(--bg-active)]' : 'hover:bg-[var(--bg-hover)]'
                  }`}
                >
                  <Avatar name={user.displayName} avatarUrl={user.avatarUrl} size="sm" isOnline={user.isOnline} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold truncate">{user.displayName}</p>
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
      pushToast({ kind: 'success', title: 'Report submitted', body: 'Our moderation team will take a look.' });
      closeModal();
    } catch (err: any) {
      pushToast({ kind: 'error', title: 'Report failed', body: err?.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={closeModal} title="Report" subtitle={props.targetName}>
      <div className="p-4 space-y-4">
        <div className="space-y-1.5">
          <SectionLabel>Reason</SectionLabel>
          {reasons.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setReason(r)}
              className={`w-full flex items-center justify-between px-3 py-2 text-xs font-semibold rounded-md border transition-colors cursor-pointer ${
                reason === r
                  ? 'border-[var(--text-primary)] bg-[var(--bg-hover)]'
                  : 'border-[var(--border-color)] hover:bg-[var(--bg-hover)]'
              }`}
            >
              {r}
              {reason === r && <Check className="w-3.5 h-3.5" />}
            </button>
          ))}
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
        <div className="flex items-center gap-2 p-3 rounded-md border border-[var(--border-color)] bg-[var(--bg-elevated)]">
          <Flag className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />
          <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
            Reports are reviewed by moderation. False reporting is discouraged.
          </p>
        </div>
        <Button className="w-full" onClick={submit} loading={busy} disabled={!reason}>
          Submit report
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
    <Modal open onClose={closeModal} title="Forward message" subtitle={message.content.slice(0, 80) || 'Attachment message'}>
      <div className="p-4 space-y-1 max-h-96 overflow-y-auto">
        {conversations.map((conv) => {
          const display = getConversationDisplay(conv, useAuthStore.getState().user?.id || '', new Set());
          return (
            <button
              key={conv.id}
              type="button"
              onClick={() => forward(conv)}
              disabled={busyId === conv.id}
              className="w-full flex items-center gap-3 px-2.5 py-2 rounded-md hover:bg-[var(--bg-hover)] text-left cursor-pointer disabled:opacity-50"
            >
              <Avatar name={display.title} avatarUrl={display.avatarUrl} size="sm" isSavedMessages={display.isSavedMessages} showPresence={false} />
              <p className="text-xs font-bold flex-1 truncate">{display.title}</p>
              <ChevronRight className="w-3.5 h-3.5 text-[var(--text-muted)]" />
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
    <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4" onClick={closeModal}>
      <button
        type="button"
        onClick={closeModal}
        className="absolute top-4 right-4 p-2 rounded-md bg-white/10 hover:bg-white/20 text-white cursor-pointer"
        aria-label="Close"
      >
        <X className="w-5 h-5" />
      </button>
      <div className="max-w-[90vw] max-h-[85vh]" onClick={(e) => e.stopPropagation()}>
        <img src={url} alt={fileName || 'Attachment'} className="max-w-full max-h-[80vh] object-contain rounded" />
        <div className="flex items-center justify-between mt-3 text-xs text-white/80">
          <span className="truncate">{fileName}</span>
          <a
            href={`${url}${url.includes('?') ? '&' : '?'}download=1`}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white/10 hover:bg-white/20 text-white cursor-pointer"
            download
          >
            <Download className="w-3.5 h-3.5" /> Download
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
    if (!window.confirm('Clear the message history of every conversation you belong to?')) return;
    try {
      await apiFetch('/api/users/me/clear-all-chats', { method: 'POST' });
      pushToast({ kind: 'success', title: 'All chats cleared' });
      window.location.reload();
    } catch {
      pushToast({ kind: 'error', title: 'Clear failed' });
    }
  };

  return (
    <Modal open onClose={closeModal} size="lg" title="Settings" headerRight={<span />}>
      <div className="flex flex-col sm:flex-row min-h-[480px]">
        {/* Tabs */}
        <div className="sm:w-44 border-b sm:border-b-0 sm:border-r border-[var(--border-color)] p-2 shrink-0">
          {SETTINGS_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                tab === t.id
                  ? 'bg-[var(--bg-inverted)] text-[var(--text-inverted)]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
              }`}
            >
              <t.icon className="w-3.5 h-3.5" /> {t.label}
            </button>
          ))}
        </div>

        <div className="flex-1 p-4 space-y-4 overflow-y-auto max-h-[60vh]">
          {tab === 'profile' && (
            <>
              <div className="flex items-center gap-4">
                <Avatar name={currentUser.displayName} avatarUrl={currentUser.avatarUrl} size="2xl" showPresence={false} />
                <div className="space-y-2">
                  <Button size="sm" variant="outline" onClick={() => avatarInputRef.current?.click()}>
                    Change avatar
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
              <div className="grid sm:grid-cols-2 gap-3">
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
              <Button onClick={saveProfile} loading={busy}>Save profile</Button>
            </>
          )}

          {tab === 'appearance' && (
            <>
              <div className="space-y-2">
                <SectionLabel>Theme</SectionLabel>
                <ThemeSwitcher mode={themeMode} onChange={setThemeMode} />
              </div>
              <div className="space-y-2">
                <SectionLabel>Chat canvas</SectionLabel>
                <div className="grid grid-cols-3 gap-2">
                  {CHAT_BACKGROUNDS.map((bg) => (
                    <button
                      key={bg.id}
                      type="button"
                      onClick={() => setChatBackground(bg.id)}
                      className={`relative h-16 rounded-md overflow-hidden border transition-all cursor-pointer ${
                        chatBackground === bg.id
                          ? 'border-[var(--text-primary)] ring-1 ring-[var(--text-primary)]'
                          : 'border-[var(--border-strong)] hover:border-[var(--text-muted)]'
                      }`}
                    >
                      {bg.imageUrl ? (
                        <img src={bg.imageUrl} alt={bg.name} className="w-full h-full object-cover" />
                      ) : (
                        <span className="block w-full h-full" style={{ backgroundColor: bg.backgroundColor }} />
                      )}
                      <span className="absolute bottom-0 inset-x-0 px-1 py-0.5 text-[9px] font-bold uppercase text-white bg-black/50 truncate">
                        {bg.name}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-3.5 pt-2">
                <Switch
                  checked={settings?.compactMode ?? false}
                  onChange={(v) => applySettings({ compactMode: v })}
                  label="Compact mode"
                  description="Tighter spacing in the chat stream."
                />
                <div className="space-y-1.5">
                  <SectionLabel>Font size</SectionLabel>
                  <div className="flex gap-1.5">
                    {(['small', 'medium', 'large'] as const).map((fs) => (
                      <button
                        key={fs}
                        type="button"
                        onClick={() => applySettings({ fontSize: fs })}
                        className={`flex-1 h-8 text-xs font-semibold rounded-md border capitalize cursor-pointer ${
                          (settings?.fontSize || 'medium') === fs
                            ? 'bg-[var(--bg-inverted)] text-[var(--text-inverted)] border-transparent'
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
            <>
              <Switch
                checked={settings?.notificationsEnabled ?? true}
                onChange={(v) => applySettings({ notificationsEnabled: v })}
                label="In-app notifications"
                description="Toast banners for new messages and invites."
              />
              <Switch
                checked={settings?.soundEnabled ?? true}
                onChange={(v) => applySettings({ soundEnabled: v })}
                label="Interface sounds"
                description="Play a subtle sound for message events."
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
                description="Browser-level notifications when the tab is in the background."
              />
              <Switch
                checked={settings?.messagePreview ?? true}
                onChange={(v) => applySettings({ messagePreview: v })}
                label="Message preview"
                description="Show message text inside notification banners."
              />
            </>
          )}

          {tab === 'privacy' && (
            <>
              <Switch
                checked={settings?.showOnlineStatus ?? true}
                onChange={(v) => applySettings({ showOnlineStatus: v })}
                label="Show online status"
                description="Others can see when you are online."
              />
              <Switch
                checked={settings?.showReadReceipts ?? true}
                onChange={(v) => applySettings({ showReadReceipts: v })}
                label="Read receipts"
                description="Show others when you have read their messages."
              />
              <Switch
                checked={settings?.showTypingIndicator ?? true}
                onChange={(v) => applySettings({ showTypingIndicator: v })}
                label="Typing indicator"
                description="Broadcast while you are typing."
              />
              <div className="space-y-2 pt-2">
                <SectionLabel>Direct messages</SectionLabel>
                <div className="grid grid-cols-2 gap-2">
                  {(['everyone', 'contacts'] as const).map((policy) => (
                    <button
                      key={policy}
                      type="button"
                      onClick={() => applySettings({ allowDirectMessages: policy })}
                      className={`h-9 text-xs font-semibold rounded-md border capitalize cursor-pointer ${
                        (settings?.allowDirectMessages || 'everyone') === policy
                          ? 'bg-[var(--bg-inverted)] text-[var(--text-inverted)] border-transparent'
                          : 'border-[var(--border-strong)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
                      }`}
                    >
                      {policy}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {tab === 'sessions' && (
            <div className="space-y-2">
              {sessions.map((session) => (
                <div
                  key={session.id}
                  className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-md border border-[var(--border-color)] bg-[var(--bg-elevated)]"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-bold truncate flex items-center gap-2">
                      {session.isCurrent && (
                        <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-[var(--bg-inverted)] text-[var(--text-inverted)]">
                          This device
                        </span>
                      )}
                    </p>
                    <p className="text-[11px] text-[var(--text-muted)] truncate">{session.userAgent}</p>
                    <p className="text-[10px] text-[var(--text-muted)] mt-0.5">
                      Active {formatFullDateTime(session.lastActiveAt)}
                    </p>
                  </div>
                  <Button variant="ghost" size="xs" onClick={() => revokeSession(session.id)}>
                    <X className="w-3 h-3" /> Revoke
                  </Button>
                </div>
              ))}
              {sessions.length === 0 && <p className="text-xs text-[var(--text-muted)]">Loading sessions…</p>}
            </div>
          )}

          {tab === 'account' && (
            <>
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
                  Update email
                </Button>
              </div>

              <div className="space-y-3 pt-3 border-t border-[var(--border-color)]">
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
                  Change password
                </Button>
              </div>

              <div className="space-y-3 pt-3 border-t border-[var(--border-color)]">
                <SectionLabel>Your data</SectionLabel>
                <Button variant="outline" onClick={exportData}>
                  <Download className="w-3.5 h-3.5" /> Export my data (JSON)
                </Button>
                <Button variant="outline" onClick={clearAllChats}>
                  <Trash2 className="w-3.5 h-3.5" /> Clear all chats
                </Button>
              </div>

              <div className="space-y-3 pt-3 border-t border-[var(--border-color)]">
                <SectionLabel>Danger zone</SectionLabel>
                <Input
                  label="Confirm password to delete account"
                  type="password"
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                />
                <Button variant="danger" onClick={deleteAccount} loading={busy} disabled={!deletePassword}>
                  <LogOut className="w-3.5 h-3.5" /> Delete account permanently
                </Button>
                <Button
                  variant="ghost"
                  className="w-full"
                  onClick={async () => {
                    await logout();
                    navigate({ to: '/login' });
                  }}
                >
                  Sign out
                </Button>
              </div>
            </>
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
