import React, { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import {
  Archive,
  Bell,
  Check,
  Download,
  FileText,
  Flag,
  Globe,
  Info,
  Link2,
  LogOut,
  MessageSquare,
  Phone,
  Pin,
  Shield,
  Trash2,
  UserMinus,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import type { Conversation, GroupRole, User } from '../../types/messaging';
import { useAuthStore } from '../../stores/auth';
import { useChatStore } from '../../stores/chat';
import { useUIStore } from '../../stores/ui';
import { formatFileSize, formatFullDateTime, formatLastSeen } from '../../lib/api';
import {
  useAddGroupMembers,
  useConversationMessages,
  useLeaveGroup,
  useRemoveGroupMember,
  useSharedMedia,
  useUpdateConversationState,
  useUpdateMemberRole,
  useUserDirectory,
} from '../../queries/hooks';
import { Avatar, Button, SectionLabel, Switch } from '../ui/DesignSystem';

type Tab = 'info' | 'media' | 'links' | 'files';

export function RightInfoPanel({
  conversation,
  onClose,
}: {
  conversation: Conversation;
  onClose?: () => void;
}) {
  const currentUser = useAuthStore((s) => s.user)!;
  const onlineUserIds = useChatStore((s) => s.onlineUserIds);
  const openModal = useUIStore((s) => s.openModal);
  const pushToast = useUIStore((s) => s.pushToast);
  const navigate = useNavigate();

  const updateState = useUpdateConversationState(conversation.id);
  const leaveGroup = useLeaveGroup();
  const removeMember = useRemoveGroupMember(conversation.id);
  const updateRole = useUpdateMemberRole(conversation.id);
  const addMembers = useAddGroupMembers(conversation.id);
  const { data: shared } = useSharedMedia(conversation.id);

  const [tab, setTab] = useState<Tab>('info');
  const [addingMembers, setAddingMembers] = useState(false);
  const { data: directory } = useUserDirectory(addingMembers ? '' : '__inactive__');

  const isGroup = conversation.type === 'group';
  const isSaved = conversation.type === 'direct' && !conversation.members.some((m) => m.userId !== currentUser.id);
  const partner = conversation.members.find((m) => m.userId !== currentUser.id);
  const amOwner = conversation.myRole === 'owner';
  const amAdmin = conversation.myRole === 'admin';
  const canManage = amOwner || amAdmin;

  const displayTitle = isGroup ? conversation.name || 'Untitled Group' : partner?.displayName || 'Saved Messages';

  return (
    <div className="h-full w-full flex flex-col bg-[var(--bg-surface)] border-l border-[var(--border-color)]">
      {/* Header */}
      <div className="flex items-center justify-between px-5 h-16 border-b border-[var(--border-color)] shrink-0">
        <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)] flex items-center gap-2">
          <Info className="w-3.5 h-3.5" /> Details
        </p>
        {onClose && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="rounded-xl h-8 w-8 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            aria-label="Close details"
          >
            <X className="w-4 h-4" />
          </Button>
        )}
      </div>

      {/* Segmented Tabs */}
      <div className="flex p-2 bg-[var(--bg-elevated)] border-b border-[var(--border-color)] shrink-0 gap-1">
        {(['info', 'media', 'links', 'files'] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`flex-1 h-7.5 text-xs font-medium rounded-xl capitalize transition-all cursor-pointer ${
              tab === t
                ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] font-bold shadow-xs border border-[var(--border-strong)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Tab Contents */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {tab === 'info' && (
          <div className="space-y-4">
            {/* Profile Card */}
            <div className="flex flex-col items-center text-center p-5 rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-strong)] shadow-xs">
              <Avatar
                name={displayTitle}
                avatarUrl={conversation.avatarUrl || partner?.avatarUrl}
                size="xl"
                isOnline={partner ? onlineUserIds.has(partner.userId) : false}
                isSavedMessages={isSaved}
                showPresence={!isSaved && !isGroup}
                className="mb-3.5 shadow-sm"
              />
              <h3 className="text-base font-bold text-[var(--text-primary)] truncate max-w-full">
                {displayTitle}
              </h3>
              {partner?.username && !isGroup && (
                <p className="text-xs text-[var(--text-muted)] font-mono mt-0.5">@{partner.username}</p>
              )}
              {isGroup && (
                <p className="text-xs text-[var(--text-muted)] mt-0.5 font-medium">
                  {conversation.members.length} member{conversation.members.length === 1 ? '' : 's'}
                </p>
              )}
              {conversation.description && (
                <p className="text-xs text-[var(--text-secondary)] mt-2 leading-relaxed max-w-xs">
                  {conversation.description}
                </p>
              )}
            </div>

            {/* Conversation Settings */}
            <div className="space-y-3.5 p-4 rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-strong)]">
              <SectionLabel>Preferences</SectionLabel>
              <Switch
                label="Mute notifications"
                description="Disable audio and desktop pings"
                checked={conversation.isMuted}
                onChange={(checked) => updateState.mutate({ isMuted: checked })}
              />
              <Switch
                label="Pin conversation"
                description="Keep conversation at top of sidebar"
                checked={conversation.isPinned}
                onChange={(checked) => updateState.mutate({ isPinned: checked })}
              />
              <Switch
                label="Archive conversation"
                description="Move out of inbox to archive"
                checked={conversation.isArchived}
                onChange={(checked) => updateState.mutate({ isArchived: checked })}
              />
            </div>

            {/* Group Members Section */}
            {isGroup && (
              <div className="space-y-3 p-4 rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-strong)]">
                <div className="flex items-center justify-between">
                  <SectionLabel>Members ({conversation.members.length})</SectionLabel>
                  {canManage && (
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => setAddingMembers((v) => !v)}
                      className="text-xs"
                    >
                      <UserPlus className="w-3.5 h-3.5" /> {addingMembers ? 'Cancel' : 'Add member'}
                    </Button>
                  )}
                </div>

                {addingMembers && (
                  <div className="p-3 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] space-y-2">
                    <p className="text-[11px] font-medium text-[var(--text-muted)]">Select user to add:</p>
                    <div className="max-h-40 overflow-y-auto space-y-1">
                      {(directory || [])
                        .filter((u: User) => !conversation.members.some((m) => m.userId === u.id))
                        .map((user: User) => (
                          <div
                            key={user.id}
                            className="flex items-center justify-between p-1.5 rounded-lg hover:bg-[var(--bg-hover)] transition-colors"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <Avatar name={user.displayName} avatarUrl={user.avatarUrl} size="xs" />
                              <div className="min-w-0">
                                <p className="text-xs font-semibold truncate">{user.displayName}</p>
                                <p className="text-[10px] text-[var(--text-muted)] font-mono">@{user.username}</p>
                              </div>
                            </div>
                            <Button
                              size="xs"
                              onClick={() => {
                                addMembers.mutate([user.id], {
                                  onSuccess: () => {
                                    pushToast({ kind: 'success', title: 'Member added', body: `${user.displayName} joined the group.` });
                                    setAddingMembers(false);
                                  },
                                });
                              }}
                            >
                              Add
                            </Button>
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                <div className="space-y-1">
                  {conversation.members.map((member) => (
                    <div
                      key={member.userId}
                      className="flex items-center gap-2.5 p-2 rounded-xl hover:bg-[var(--bg-hover)] transition-colors group/m"
                    >
                      <Avatar
                        name={member.displayName}
                        avatarUrl={member.avatarUrl}
                        isOnline={onlineUserIds.has(member.userId)}
                        size="xs"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold truncate flex items-center gap-1.5">
                          {member.displayName}
                          {member.userId === currentUser.id && (
                            <span className="text-[10px] text-[var(--text-muted)] font-normal">(you)</span>
                          )}
                        </p>
                        <p className="text-[10px] text-[var(--text-muted)] font-mono truncate">@{member.username}</p>
                      </div>
                      <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-muted)] px-1.5 py-0.5 rounded-md bg-[var(--bg-surface)] border border-[var(--border-subtle)] shrink-0">
                        {member.role}
                      </span>

                      {amOwner && member.userId !== currentUser.id && member.role !== 'owner' && (
                        <button
                          type="button"
                          onClick={() =>
                            updateRole.mutate({
                              targetUserId: member.userId,
                              role: member.role === 'admin' ? 'member' : 'admin',
                            })
                          }
                          title={member.role === 'admin' ? 'Demote to member' : 'Promote to admin'}
                          className="opacity-0 group-hover/m:opacity-100 text-[10px] px-2 py-0.5 rounded-md border border-[var(--border-strong)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                        >
                          {member.role === 'admin' ? 'Demote' : 'Promote'}
                        </button>
                      )}

                      {(canManage || member.userId === currentUser.id) && member.role !== 'owner' && (
                        <button
                          type="button"
                          onClick={() => {
                            if (member.userId === currentUser.id) {
                              leaveGroup.mutate(conversation.id, {
                                onSuccess: () => navigate({ to: '/app' }),
                              });
                            } else {
                              removeMember.mutate(member.userId);
                              pushToast({ kind: 'info', title: 'Member removed' });
                            }
                          }}
                          className="opacity-0 group-hover/m:opacity-100 p-1.5 rounded-lg hover:bg-[var(--bg-active)] text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                          title={member.userId === currentUser.id ? 'Leave group' : 'Remove member'}
                        >
                          {member.userId === currentUser.id ? <LogOut className="w-3.5 h-3.5" /> : <UserMinus className="w-3.5 h-3.5" />}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Actions / Danger Zone */}
            <div className="space-y-1.5 pt-2 border-t border-[var(--border-color)]">
              <button
                type="button"
                onClick={() => {
                  fetch(`/api/conversations/${conversation.id}/clear`, { method: 'POST' }).then(() => {
                    pushToast({ kind: 'info', title: 'History cleared' });
                    window.location.reload();
                  });
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] rounded-xl cursor-pointer transition-colors"
              >
                <Trash2 className="w-4 h-4" /> Clear history
              </button>
              <button
                type="button"
                onClick={() =>
                  openModal({
                    kind: 'report',
                    targetType: isGroup ? 'conversation' : 'user',
                    targetId: isGroup ? conversation.id : partner?.userId || '',
                    targetName: displayTitle,
                  })
                }
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-[var(--text-secondary)] hover:text-rose-400 hover:bg-[var(--bg-hover)] rounded-xl cursor-pointer transition-colors"
              >
                <Flag className="w-4 h-4" /> Report {isGroup ? 'group' : 'user'}
              </button>
            </div>
          </div>
        )}

        {tab === 'media' && (
          <MediaGrid shared={shared} onOpenImage={(url, name) => openModal({ kind: 'lightbox', url, fileName: name })} />
        )}
        {tab === 'links' && <LinksList shared={shared} />}
        {tab === 'files' && <FilesList shared={shared} />}
      </div>
    </div>
  );
}

function MediaGrid({ shared, onOpenImage }: { shared: any; onOpenImage: (url: string, name?: string) => void }) {
  const media = shared?.media || [];
  if (media.length === 0) {
    return <EmptyState icon={Info} label="No shared media yet" />;
  }
  return (
    <div className="grid grid-cols-3 gap-2">
      {media.map((m: any) => (
        <button
          key={m.id}
          type="button"
          onClick={() => onOpenImage(m.url, m.fileName)}
          className="aspect-square rounded-xl overflow-hidden border border-[var(--border-strong)] cursor-zoom-in group shadow-xs"
        >
          <img
            src={m.url}
            alt={m.fileName}
            loading="lazy"
            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
          />
        </button>
      ))}
    </div>
  );
}

function LinksList({ shared }: { shared: any }) {
  const links = shared?.links || [];
  if (links.length === 0) return <EmptyState icon={Link2} label="No shared links yet" />;
  return (
    <div className="space-y-2">
      {links.map((l: any, i: number) => (
        <a
          key={`${l.url}-${i}`}
          href={l.url}
          target="_blank"
          rel="noopener noreferrer"
          className="block p-3.5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] hover:bg-[var(--bg-hover)] transition-colors shadow-xs"
        >
          <p className="text-xs font-semibold text-[var(--text-primary)] truncate">{l.url}</p>
          <p className="text-[10px] text-[var(--text-muted)] mt-1 font-mono">
            {l.senderName} · {formatFullDateTime(l.createdAt)}
          </p>
        </a>
      ))}
    </div>
  );
}

function FilesList({ shared }: { shared: any }) {
  const files = shared?.files || [];
  if (files.length === 0) return <EmptyState icon={FileText} label="No shared files yet" />;
  return (
    <div className="space-y-2">
      {files.map((f: any) => (
        <a
          key={f.id}
          href={`${f.url}${f.url.includes('?') ? '&' : '?'}download=1&name=${encodeURIComponent(f.fileName)}`}
          className="flex items-center gap-3 p-3.5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] hover:bg-[var(--bg-hover)] transition-colors shadow-xs"
        >
          <div className="w-8.5 h-8.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] flex items-center justify-center shrink-0">
            <FileText className="w-4 h-4 text-[var(--text-muted)]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-[var(--text-primary)] truncate">{f.fileName}</p>
            <p className="text-[10px] text-[var(--text-muted)] font-mono mt-0.5">
              {formatFileSize(f.fileSize)} · {f.senderName}
            </p>
          </div>
          <Download className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />
        </a>
      ))}
    </div>
  );
}

function EmptyState({ icon: Icon, label }: { icon: any; label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Icon className="w-6 h-6 text-[var(--text-muted)] opacity-30 mb-2" />
      <p className="text-xs text-[var(--text-muted)]">{label}</p>
    </div>
  );
}
