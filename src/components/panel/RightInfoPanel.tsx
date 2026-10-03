import React, { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import {
  Archive,
  Bell,
  FileText,
  Flag,
  Globe,
  Info,
  Link2,
  LogOut,
  MessageSquare,
  Phone,
  Pin,
  Trash2,
  UserMinus,
  X,
} from 'lucide-react';
import type { Conversation, GroupRole } from '../../types/messaging';
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
      <div className="flex items-center justify-between px-4 h-[57px] border-b border-[var(--border-color)] shrink-0">
        <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)] flex items-center gap-1.5">
          <Info className="w-3.5 h-3.5" /> Details
        </p>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] cursor-pointer"
            aria-label="Close details"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[var(--border-color)] shrink-0">
        {(['info', 'media', 'links', 'files'] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`flex-1 h-9 text-[10px] font-bold uppercase tracking-wider transition-colors cursor-pointer ${
              tab === t
                ? 'text-[var(--text-primary)] border-b-2 border-[var(--text-primary)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {tab === 'info' && (
          <div className="space-y-5">
            {/* Identity */}
            <div className="flex flex-col items-center text-center gap-3">
              <Avatar
                name={displayTitle}
                avatarUrl={isGroup ? conversation.avatarUrl : partner?.avatarUrl || currentUser.avatarUrl}
                isOnline={!isGroup ? conversation.members.some((m) => onlineUserIds.has(m.userId) || m.isOnline) : false}
                isSavedMessages={isSaved}
                showPresence={!isGroup && !isSaved}
                size="2xl"
              />
              <div>
                <p className="text-sm font-bold text-[var(--text-primary)]">{displayTitle}</p>
                {partner && (
                  <p className="text-xs text-[var(--text-muted)] mt-0.5">
                    {partner.isOnline ? 'online' : formatLastSeen(partner.lastSeenAt)}
                  </p>
                )}
                {isGroup && (
                  <p className="text-xs text-[var(--text-muted)] mt-0.5">
                    {conversation.members.length} members
                  </p>
                )}
              </div>
              {(partner?.statusText || (!isGroup && currentUser.statusText)) && !isSaved && (
                <p className="text-xs text-[var(--text-secondary)] italic">
                  “{partner?.statusText || currentUser.statusText}”
                </p>
              )}
            </div>

            {/* Contact fields */}
            {!isGroup && partner && !isSaved && (
              <div className="space-y-2">
                {[
                  { icon: MessageSquare, label: 'Username', value: `@${partner.username}` },
                  partner.phone && { icon: Phone, label: 'Phone', value: partner.phone },
                  partner.title && { icon: Info, label: 'Title', value: partner.title },
                  partner.pronouns && { icon: Info, label: 'Pronouns', value: partner.pronouns },
                  partner.location && { icon: Globe, label: 'Location', value: partner.location },
                  partner.website && { icon: Link2, label: 'Website', value: partner.website },
                ]
                  .filter(Boolean)
                  .map((field: any) => (
                    <div
                      key={field.label}
                      className="flex items-center gap-3 px-3 py-2 rounded-md border border-[var(--border-color)] bg-[var(--bg-elevated)]"
                    >
                      <field.icon className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />
                      <div className="min-w-0">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                          {field.label}
                        </p>
                        <p className="text-xs text-[var(--text-primary)] truncate">{field.value}</p>
                      </div>
                    </div>
                  ))}
              </div>
            )}

            {isGroup && conversation.description && (
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed px-1">
                {conversation.description}
              </p>
            )}

            {/* Conversation switches */}
            <div className="space-y-3 px-1">
              <Switch
                checked={conversation.isPinned}
                onChange={(v) => updateState.mutate({ isPinned: v })}
                label="Pin conversation"
                description="Keep it at the top of the list."
              />
              <Switch
                checked={conversation.isMuted}
                onChange={(v) => updateState.mutate({ isMuted: v })}
                label="Mute"
                description="No notifications from this chat."
              />
              <Switch
                checked={conversation.isArchived}
                onChange={(v) => updateState.mutate({ isArchived: v })}
                label="Archive"
                description="Hide it from the main list."
              />
            </div>

            {/* Members (groups) */}
            {isGroup && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <SectionLabel>{conversation.members.length} members</SectionLabel>
                  {canManage && (
                    <button
                      type="button"
                      onClick={async () => {
                        setAddingMembers((v) => !v);
                      }}
                      className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                    >
                      + Add
                    </button>
                  )}
                </div>

                {addingMembers && (
                  <div className="max-h-52 overflow-y-auto space-y-1 p-2 rounded-md border border-[var(--border-strong)] bg-[var(--bg-elevated)]">
                    {(directory || [])
                      .filter((u) => !conversation.members.some((m) => m.userId === u.id))
                      .map((user) => (
                        <button
                          key={user.id}
                          type="button"
                          onClick={() => {
                            addMembers.mutate([user.id], {
                              onSuccess: () => {
                                setAddingMembers(false);
                              },
                            });
                          }}
                          className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-[var(--bg-hover)] text-left cursor-pointer"
                        >
                          <Avatar name={user.displayName} avatarUrl={user.avatarUrl} size="xs" showPresence={false} />
                          <span className="text-xs font-semibold flex-1 truncate">{user.displayName}</span>
                          <span className="text-[10px] text-[var(--text-muted)] font-mono">@{user.username}</span>
                        </button>
                      ))}
                  </div>
                )}

                <div className="max-h-72 overflow-y-auto space-y-0.5">
                  {conversation.members.map((member) => (
                    <div
                      key={member.userId}
                      className="flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-[var(--bg-hover)] group/m"
                    >
                      <Avatar
                        name={member.displayName}
                        avatarUrl={member.avatarUrl}
                        isOnline={onlineUserIds.has(member.userId) || member.isOnline}
                        size="xs"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold truncate flex items-center gap-1.5">
                          {member.displayName}
                          {member.userId === currentUser.id && (
                            <span className="text-[9px] text-[var(--text-muted)]">(you)</span>
                          )}
                        </p>
                        <p className="text-[10px] text-[var(--text-muted)] font-mono truncate">@{member.username}</p>
                      </div>
                      <span className="text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)] shrink-0">
                        {member.role}
                      </span>

                      {amOwner && member.userId !== currentUser.id && member.role !== 'owner' && (
                        <div className="flex items-center gap-0.5 opacity-0 group-hover/m:opacity-100 transition-opacity">
                          <button
                            type="button"
                            onClick={() =>
                              updateRole.mutate({
                                targetUserId: member.userId,
                                role: member.role === 'admin' ? 'member' : 'admin',
                              })
                            }
                            title={member.role === 'admin' ? 'Demote to member' : 'Promote to admin'}
                            className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border border-[var(--border-strong)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                          >
                            {member.role === 'admin' ? '↓' : '↑'}
                          </button>
                        </div>
                      )}
                      {(canManage || member.userId === currentUser.id) && member.role !== 'owner' && (
                        <button
                          type="button"
                          onClick={() => {
                            if (member.userId === currentUser.id) {
                              leaveGroup.mutate(conversation.id, {
                                onSuccess: () => navigate({ to: '/app' }),
                              });
                            } else if (window.confirm(`Remove ${member.displayName} from the group?`)) {
                              removeMember.mutate(member.userId);
                            }
                          }}
                          className="opacity-0 group-hover/m:opacity-100 p-1 rounded hover:bg-[var(--bg-active)] text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                          title={member.userId === currentUser.id ? 'Leave group' : 'Remove member'}
                        >
                          {member.userId === currentUser.id ? (
                            <LogOut className="w-3 h-3" />
                          ) : (
                            <UserMinus className="w-3 h-3" />
                          )}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Danger zone */}
            <div className="space-y-1.5 pt-2 border-t border-[var(--border-color)]">
              <button
                type="button"
                onClick={() => {
                  if (window.confirm('Clear the entire history of this conversation?')) {
                    fetch(`/api/conversations/${conversation.id}/clear`, { method: 'POST' });
                  }
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] rounded-md cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" /> Clear history
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
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] rounded-md cursor-pointer"
              >
                <Flag className="w-3.5 h-3.5" /> Report {isGroup ? 'group' : 'user'}
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
    <div className="grid grid-cols-3 gap-1.5">
      {media.map((m: any) => (
        <button
          key={m.id}
          type="button"
          onClick={() => onOpenImage(m.url, m.fileName)}
          className="aspect-square rounded-md overflow-hidden border border-[var(--border-color)] cursor-zoom-in group"
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
          className="block px-3 py-2 rounded-md border border-[var(--border-color)] bg-[var(--bg-elevated)] hover:bg-[var(--bg-hover)] transition-colors"
        >
          <p className="text-xs font-semibold text-[var(--text-primary)] truncate">{l.url}</p>
          <p className="text-[10px] text-[var(--text-muted)] mt-0.5">
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
          className="flex items-center gap-2.5 px-3 py-2 rounded-md border border-[var(--border-color)] bg-[var(--bg-elevated)] hover:bg-[var(--bg-hover)] transition-colors"
        >
          <FileText className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-[var(--text-primary)] truncate">{f.fileName}</p>
            <p className="text-[10px] text-[var(--text-muted)]">
              {formatFileSize(f.fileSize)} · {f.senderName}
            </p>
          </div>
        </a>
      ))}
    </div>
  );
}

function EmptyState({ icon: Icon, label }: { icon: any; label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Icon className="w-6 h-6 text-[var(--text-muted)] opacity-50 mb-2" />
      <p className="text-xs text-[var(--text-muted)]">{label}</p>
    </div>
  );
}
