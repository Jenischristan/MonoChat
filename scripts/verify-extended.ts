/**
 * MonoChat Extended Test Suite
 * Covers: groups RBAC deep checks, message pagination, file uploads, sessions,
 * settings, notifications, conversations state, WS typing/presence, edge cases.
 * Run against a running server on port 3000: bun run test:extended
 */
import WebSocket from 'ws';

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:3000';
const WS_URL = BASE_URL.replace('http', 'ws') + '/ws';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(condition: any, message: string) {
  if (condition) {
    passed++;
    console.log(`  ✅ ${message}`);
  } else {
    failed++;
    failures.push(message);
    console.error(`  ❌ ${message}`);
  }
}

async function api<T = any>(
  path: string,
  options: RequestInit = {},
  token?: string
): Promise<{ status: number; data: T; headers: Headers }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });
  const text = await res.text();
  let data: any = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: res.status, data, headers: res.headers };
}

function wait(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Collect WS events into a list */
function collectWs(token: string): Promise<{ ws: WebSocket; events: any[]; ready: Promise<void> }> {
  const events: any[] = [];
  const ws = new WebSocket(`${WS_URL}?token=${encodeURIComponent(token)}`);
  const ready = new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('WS connect timeout')), 5000);
    ws.on('open', () => {
      clearTimeout(t);
      resolve();
    });
    ws.on('error', (e) => {
      clearTimeout(t);
      reject(e);
    });
  });
  ws.on('message', (raw) => {
    try {
      events.push(JSON.parse(raw.toString()));
    } catch {
      /* ignore */
    }
  });
  return Promise.resolve({ ws, events, ready });
}

async function main() {
  const tag = Date.now().toString(36);
  console.log(`\n=== MonoChat Extended Suite (tag: ${tag}) ===\n`);

  // ---------- A. AUTH & SESSIONS ----------
  console.log('A. Auth & Sessions');
  const u1 = `exa_${tag}`;
  const u2 = `exb_${tag}`;
  const u3 = `exc_${tag}`;

  const r1 = await api('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      username: u1,
      displayName: 'Ext Alpha',
      email: `${u1}@test.local`,
      password: 'Secret123!',
      title: 'QA Lead',
      pronouns: 'they/them',
      phone: '+1 555 0101',
    }),
  });
  assert(r1.status === 201 && r1.data.token, 'register user A (with profile fields)');
  assert(r1.data.user.title === 'QA Lead' && r1.data.user.pronouns === 'they/them', 'profile fields persisted');
  const t1: string = r1.data.token;
  const id1: string = r1.data.user.id;

  const r2 = await api('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username: u2, displayName: 'Ext Bravo', email: `${u2}@test.local`, password: 'Secret123!' }),
  });
  assert(r2.status === 201, 'register user B');
  const t2: string = r2.data.token;
  const id2: string = r2.data.user.id;

  const r3 = await api('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username: u3, displayName: 'Ext Charlie', email: `${u3}@test.local`, password: 'Secret123!' }),
  });
  assert(r3.status === 201, 'register user C');
  const t3: string = r3.data.token;
  const id3: string = r3.data.user.id;

  const dupU = await api('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username: u1, displayName: 'Dup', email: `dup${tag}@test.local`, password: 'Secret123!' }),
  });
  assert(dupU.status === 409, 'duplicate username rejected 409');

  const dupE = await api('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username: `other_${tag}`, displayName: 'Dup', email: `${u1}@test.local`, password: 'Secret123!' }),
  });
  assert(dupE.status === 409, 'duplicate email rejected 409');

  const shortPw = await api('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username: `pw_${tag}`, displayName: 'Pw', email: `pw_${tag}@test.local`, password: '12345' }),
  });
  assert(shortPw.status === 400, 'short password rejected 400');

  const badLogin = await api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ identifier: u1, password: 'WrongPass!' }),
  });
  assert(badLogin.status === 401, 'wrong password login rejected 401');

  const noAuth = await api('/api/conversations');
  assert(noAuth.status === 401, 'unauthenticated API rejected 401');

  const badToken = await api('/api/conversations', {}, 'invalid_token_abc');
  assert(badToken.status === 401, 'invalid token rejected 401');

  // sessions management
  const login2 = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ identifier: u1, password: 'Secret123!' }) });
  assert(login2.status === 200, 'second login creates new session');
  const t1b: string = login2.data.token;

  const sessList = await api('/api/auth/sessions', {}, t1);
  assert(sessList.status === 200 && sessList.data.sessions.length >= 2, 'session list shows both sessions');
  assert(sessList.data.sessions.some((s: any) => s.isCurrent), 'current session flagged');

  const otherSess = sessList.data.sessions.find((s: any) => !s.isCurrent);
  const delSess = await api(`/api/auth/sessions/${otherSess.id}`, { method: 'DELETE' }, t1);
  assert(delSess.status === 200, 'revoke other session ok');
  const revokedCheck = await api('/api/auth/me', {}, t1b);
  assert(revokedCheck.status === 401, 'revoked session token now unauthorized');

  // change password
  const badChange = await api('/api/auth/change-password', { method: 'POST', body: JSON.stringify({ currentPassword: 'nope', newPassword: 'NewPass123!' }) }, t1);
  assert(badChange.status === 401, 'change-password wrong current rejected');
  const goodChange = await api('/api/auth/change-password', { method: 'POST', body: JSON.stringify({ currentPassword: 'Secret123!', newPassword: 'NewPass123!' }) }, t1);
  assert(goodChange.status === 200, 'change-password ok');
  const relogin = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ identifier: u1, password: 'NewPass123!' }) });
  assert(relogin.status === 200, 'login with new password ok');
  const t1c: string = relogin.data.token;

  // /status + check-username
  const status = await api('/api/auth/status');
  assert(status.status === 200 && status.data.hasUsers === true, 'auth/status hasUsers true');
  const chk = await api(`/api/auth/check-username?username=${encodeURIComponent(u1)}`);
  assert(chk.status === 200 && chk.data.available === false, 'check-username taken');
  const chk2 = await api(`/api/auth/check-username?username=fresh_${tag}`);
  assert(chk2.data.available === true, 'check-username available');
  const chk3 = await api(`/api/auth/check-username?username=a`);
  assert(chk3.data.available === false, 'check-username too short rejected');

  // ---------- B. USERS / PROFILE / SETTINGS ----------
  console.log('\nB. Users, Profile & Settings');
  const meRes = await api('/api/auth/me', {}, t1c);
  assert(meRes.status === 200 && meRes.data.user.username === u1, 'GET /me returns profile');

  const badUsername = await api('/api/users/me', { method: 'PATCH', body: JSON.stringify({ username: 'BAD NAME!!' }) }, t1c);
  assert(badUsername.status === 400, 'invalid username format rejected');

  const takenUsername = await api('/api/users/me', { method: 'PATCH', body: JSON.stringify({ username: u2 }) }, t1c);
  assert(takenUsername.status === 409, 'username conflict on profile update rejected');

  const profUpd = await api('/api/users/me', {
    method: 'PATCH',
    body: JSON.stringify({ displayName: 'Alpha Prime', bio: 'Testing all things', location: 'Berlin', website: 'https://example.com' }),
  }, t1c);
  assert(profUpd.status === 200 && profUpd.data.user.displayName === 'Alpha Prime', 'profile update ok');

  const badEmail = await api('/api/users/me/email', { method: 'POST', body: JSON.stringify({ email: 'not-an-email' }) }, t1c);
  assert(badEmail.status === 400, 'invalid email change rejected');

  const emailChange = await api('/api/users/me/email', { method: 'POST', body: JSON.stringify({ email: `new_${u1}@test.local`, password: 'NewPass123!' }) }, t1c);
  assert(emailChange.status === 200, 'email change with password ok');

  const settingsUpd = await api('/api/users/me/settings', {
    method: 'PATCH',
    body: JSON.stringify({ theme: 'light', enterToSend: false, compactMode: true, fontSize: 'large', allowDirectMessages: 'contacts', chatWallpaper: 'obsidian-dunes' }),
  }, t1c);
  assert(settingsUpd.status === 200 && settingsUpd.data.user.settings.theme === 'light', 'settings update ok');
  assert(settingsUpd.data.user.settings.enterToSend === false && settingsUpd.data.user.settings.compactMode === true, 'toggle settings persisted');
  // revert theme to dark for consistency
  await api('/api/users/me/settings', { method: 'PATCH', body: JSON.stringify({ theme: 'dark' }) }, t1c);

  const badTheme = await api('/api/users/me/settings', { method: 'PATCH', body: JSON.stringify({ theme: 'purple' }) }, t1c);
  assert(badTheme.status === 200 && badTheme.data.user.settings.theme === 'dark', 'invalid theme falls back to current');

  const blockSelf = await api(`/api/users/${id1}/block`, { method: 'POST' }, t1c);
  assert(blockSelf.status === 400, 'cannot block yourself');

  const blockB = await api(`/api/users/${id2}/block`, { method: 'POST' }, t1c);
  assert(blockB.status === 200, 'block user B ok');
  const blockedList = await api('/api/users/me/blocked', {}, t1c);
  assert(blockedList.status === 200 && blockedList.data.blockedUsers.some((u: any) => u.id === id2), 'blocked list contains B');
  await api(`/api/users/${id2}/block`, { method: 'DELETE' }, t1c);

  const report = await api('/api/users/report', {
    method: 'POST',
    body: JSON.stringify({ targetType: 'user', targetId: id3, targetUserId: id3, targetName: 'Ext Charlie', reason: 'spam', details: 'test report' }),
  }, t1c);
  assert(report.status === 201 && report.data.report.id, 'submit report ok');
  const reports = await api('/api/users/me/reports', {}, t1c);
  assert(reports.status === 200 && reports.data.reports.length >= 1, 'report history listed');

  const exportRes = await api('/api/users/me/export', {}, t1c);
  assert(exportRes.status === 200 && exportRes.data.account.username === u1 && Array.isArray(exportRes.data.sentMessages), 'GDPR data export works');

  // ---------- C. CONVERSATIONS & STATE ----------
  console.log('\nC. Conversations & State');
  const dm1 = await api('/api/conversations/direct', { method: 'POST', body: JSON.stringify({ targetUserId: id2 }) }, t1c);
  assert(dm1.status === 201 && dm1.data.conversation.id, 'DM created A->B');
  const dmId: string = dm1.data.conversation.id;

  const dm2 = await api('/api/conversations/direct', { method: 'POST', body: JSON.stringify({ targetUserId: id2 }) }, t1c);
  assert(dm2.status === 200 && dm2.data.conversation.id === dmId && dm2.data.created === false, 'DM dedupe returns existing');

  const dmByUsername = await api('/api/conversations/direct', { method: 'POST', body: JSON.stringify({ contactUsername: u3 }) }, t1c);
  assert(dmByUsername.status === 201 && dmByUsername.data.conversation.id, 'DM by username works');
  const dm3Id: string = dmByUsername.data.conversation.id;

  const dmNoUser = await api('/api/conversations/direct', { method: 'POST', body: JSON.stringify({ contactUsername: 'ghost_user_xyz' }) }, t1c);
  assert(dmNoUser.status === 404, 'DM to non-existent user rejected');

  // send initial message
  const msg1 = await api(`/api/conversations/${dmId}/messages`, { method: 'POST', body: JSON.stringify({ content: 'First message' }) }, t1c);
  assert(msg1.status === 201 && msg1.data.message.id, 'send message 1');
  const m1Id = msg1.data.message.id;

  const emptyMsg = await api(`/api/conversations/${dmId}/messages`, { method: 'POST', body: JSON.stringify({ content: '' }) }, t1c);
  assert(emptyMsg.status === 400, 'empty message rejected');

  const state1 = await api(`/api/conversations/${dmId}/state`, { method: 'PATCH', body: JSON.stringify({ isPinned: true, isMuted: true, draftText: 'draft hello' }) }, t1c);
  assert(state1.status === 200 && state1.data.conversation.isPinned === true && state1.data.conversation.isMuted === true, 'pin/mute state saved');
  assert(state1.data.conversation.draftText === 'draft hello', 'draft text saved');

  const state2 = await api(`/api/conversations/${dmId}/state`, { method: 'PATCH', body: JSON.stringify({ markedUnread: true }) }, t1c);
  assert(state2.status === 200 && state2.data.conversation.unreadOverride === true, 'marked unread override works');

  const convList = await api('/api/conversations', {}, t1c);
  const foundConv = convList.data.conversations.find((c: any) => c.id === dmId);
  assert(foundConv && foundConv.isPinned === true, 'pinned conversation in list');

  const readRes = await api(`/api/conversations/${dmId}/read`, { method: 'POST' }, t1c);
  assert(readRes.status === 200, 'mark read ok');

  const foreignConv = await api(`/api/conversations/${dm3Id}/messages`, {}, t2);
  assert(foreignConv.status === 403, 'non-member cannot read conversation');

  // ---------- D. MESSAGES: reply, edit perms, delete perms, pagination ----------
  console.log('\nD. Messages Deep Tests');
  const msg2 = await api(`/api/conversations/${dmId}/messages`, { method: 'POST', body: JSON.stringify({ content: 'Reply target', replyToId: m1Id }) }, t2);
  assert(msg2.status === 201 && msg2.data.message.replyTo && msg2.data.message.replyTo.id === m1Id, 'reply carries hydrated replyTo');
  const m2Id = msg2.data.message.id;

  const editForeign = await api(`/api/messages/${m1Id}`, { method: 'PATCH', body: JSON.stringify({ content: 'hacked' }) }, t2);
  assert(editForeign.status === 403, 'cannot edit someone else message');

  const delForeign = await api(`/api/messages/${m1Id}`, { method: 'DELETE' }, t2);
  assert(delForeign.status === 403, 'non-moderator cannot delete others message in DM');

  // pagination: insert 12 more
  for (let i = 0; i < 12; i++) {
    await api(`/api/conversations/${dmId}/messages`, { method: 'POST', body: JSON.stringify({ content: `bulk ${i}` }) }, t1c);
  }
  // NOTE: server clamps limit to min 10, max 100
  const page1 = await api(`/api/conversations/${dmId}/messages?limit=10`, {}, t1c);
  assert(page1.status === 200 && page1.data.messages.length === 10 && page1.data.hasMore === true, 'pagination page 1 with hasMore');
  assert(page1.data.messages[page1.data.messages.length - 1].content === 'bulk 11', 'newest message last (chronological)');

  const oldest = page1.data.messages[0].createdAt;
  const page2 = await api(`/api/conversations/${dmId}/messages?limit=10&before=${encodeURIComponent(oldest)}`, {}, t1c);
  assert(page2.status === 200 && page2.data.messages.length >= 1 && page2.data.messages.length <= 10, 'cursor pagination before works');
  assert(new Date(page2.data.messages[0].createdAt) < new Date(oldest), 'page 2 strictly older');
  const clampLow = await api(`/api/conversations/${dmId}/messages?limit=2`, {}, t1c);
  assert(clampLow.data.messages.length === 10, 'limit clamped to minimum 10');

  const pinnedMsg = await api(`/api/messages/${m2Id}/pin`, { method: 'POST' }, t1c);
  assert(pinnedMsg.status === 200 && pinnedMsg.data.isPinned === true, 'pin in DM allowed (sender=member)');

  // reactions toggle off
  const rxOn = await api(`/api/messages/${m2Id}/reactions`, { method: 'POST', body: JSON.stringify({ emoji: '👍' }) }, t2);
  assert(rxOn.status === 200 && rxOn.data.reactions.length === 1 && rxOn.data.reactions[0].reactedByMe === true, 'reaction added');
  const rxOff = await api(`/api/messages/${m2Id}/reactions`, { method: 'POST', body: JSON.stringify({ emoji: '👍' }) }, t2);
  assert(rxOff.status === 200 && rxOff.data.reactions.length === 0, 'reaction toggled off');

  // shared media endpoint
  const shared = await api(`/api/messages/conversation/${dmId}/shared`, {}, t1c);
  assert(shared.status === 200 && Array.isArray(shared.data.media) && Array.isArray(shared.data.files) && Array.isArray(shared.data.links), 'shared media/files/links endpoint');
  const linkMsg = await api(`/api/conversations/${dmId}/messages`, { method: 'POST', body: JSON.stringify({ content: 'check https://example.com/page now' }) }, t1c);
  assert(linkMsg.status === 201, 'link message sent');
  const shared2 = await api(`/api/messages/conversation/${dmId}/shared`, {}, t1c);
  assert(shared2.data.links.some((l: any) => l.url.includes('example.com')), 'link extracted into shared links');

  // clear history RBAC in groups (covered later) / DM allowed
  // ---------- E. GROUPS & RBAC ----------
  console.log('\nE. Groups & RBAC');
  const grp = await api('/api/groups', {
    method: 'POST',
    body: JSON.stringify({ name: 'QA Squad', description: 'testing group', memberIds: [id2, id3] }),
  }, t1c);
  assert(grp.status === 201 && grp.data.conversation.type === 'group', 'group created with 2 members');
  const gid: string = grp.data.conversation.id;
  assert(grp.data.conversation.members.length === 3, 'group has 3 members');
  assert(grp.data.conversation.members.find((m: any) => m.userId === id1).role === 'owner', 'creator is owner');
  assert(grp.data.conversation.lastMessage && grp.data.conversation.lastMessage.content.includes('QA Squad'), 'welcome message created');

  const grpBadName = await api('/api/groups', { method: 'POST', body: JSON.stringify({ name: 'x' }) }, t1c);
  assert(grpBadName.status === 400, 'group name min length enforced');

  // B (member) tries to edit group -> 403
  const editByMember = await api(`/api/groups/${gid}`, { method: 'PATCH', body: JSON.stringify({ name: 'Hijacked' }) }, t2);
  assert(editByMember.status === 403, 'member cannot edit group');

  // A (owner) edits group
  const editByOwner = await api(`/api/groups/${gid}`, { method: 'PATCH', body: JSON.stringify({ name: 'QA Squad Prime', description: 'updated' }) }, t1c);
  assert(editByOwner.status === 200 && editByOwner.data.conversation.name === 'QA Squad Prime', 'owner edits group');

  // promote B to admin
  const promote = await api(`/api/groups/${gid}/members/${id2}`, { method: 'PATCH', body: JSON.stringify({ role: 'admin' }) }, t1c);
  assert(promote.status === 200, 'owner promotes B to admin');

  // non-owner (B as admin) tries role change -> 403 (only owner)
  const roleByAdmin = await api(`/api/groups/${gid}/members/${id3}`, { method: 'PATCH', body: JSON.stringify({ role: 'admin' }) }, t2);
  assert(roleByAdmin.status === 403, 'admin cannot change roles (owner only)');

  // B (admin) can add members
  const addByAdmin = await api(`/api/groups/${gid}/members`, { method: 'POST', body: JSON.stringify({ memberIds: [] }) }, t2);
  assert(addByAdmin.status === 400, 'add members with empty list rejected');

  // C (member) tries to add -> 403
  const addByMember = await api(`/api/groups/${gid}/members`, { method: 'POST', body: JSON.stringify({ memberIds: [id3] }) }, t3);
  assert(addByMember.status === 403, 'member cannot add members');

  // admin removes member C
  const removeByAdmin = await api(`/api/groups/${gid}/members/${id3}`, { method: 'DELETE' }, t2);
  assert(removeByAdmin.status === 200, 'admin removes member');
  assert(removeByAdmin.data.conversation.members.length === 2, 'member count now 2');

  // admin tries remove owner -> 403
  const removeOwner = await api(`/api/groups/${gid}/members/${id1}`, { method: 'DELETE' }, t2);
  assert(removeOwner.status === 403, 'owner cannot be removed');

  // C rejoins via add by owner
  const readd = await api(`/api/groups/${gid}/members`, { method: 'POST', body: JSON.stringify({ memberIds: [id3] }) }, t1c);
  assert(readd.status === 200 && readd.data.conversation.members.length === 3, 'owner re-adds member');

  // owner transfers ownership
  const transfer = await api(`/api/groups/${gid}/members/${id2}`, { method: 'PATCH', body: JSON.stringify({ role: 'owner' }) }, t1c);
  assert(transfer.status === 200, 'ownership transfer ok');
  const afterTransfer = await api(`/api/conversations/${gid}`, {}, t1c);
  assert(afterTransfer.data.conversation.myRole === 'admin', 'previous owner demoted to admin');

  // clear history: member forbidden in group
  const clearByMember = await api(`/api/conversations/${gid}/clear`, { method: 'POST' }, t3);
  assert(clearByMember.status === 403, 'member cannot clear group history');

  // new owner (B) can clear
  const clearByOwner = await api(`/api/conversations/${gid}/clear`, { method: 'POST' }, t2);
  assert(clearByOwner.status === 200 && clearByOwner.data.cleared === true, 'new owner clears history');

  // leave group (C leaves)
  const leave = await api(`/api/groups/${gid}/leave`, { method: 'POST' }, t3);
  assert(leave.status === 200, 'member leaves group');

  // leave as last owner -> ownership auto-transfer; B is owner, A admin leaves
  const leaveAdmin = await api(`/api/groups/${gid}/leave`, { method: 'POST' }, t1c);
  assert(leaveAdmin.status === 200, 'admin leaves group');

  // ---------- F. FILES ----------
  console.log('\nF. File Uploads');
  const boundary = '----monochat' + tag;

  function multipartBody(field: string, fileName: string, mime: string, content: Buffer | string) {
    const buf = typeof content === 'string' ? Buffer.from(content) : content;
    return {
      body: Buffer.concat([
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${field}"; filename="${fileName}"\r\nContent-Type: ${mime}\r\n\r\n`),
        buf,
        Buffer.from(`\r\n--${boundary}--\r\n`),
      ]),
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
    };
  }

  const png = Buffer.from(
    '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c626001000000ffff03000006000557bfabd40000000049454e44ae426082',
    'hex'
  );
  const upImg = await fetch(`${BASE_URL}/api/files/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${t1c}`, ...multipartBody('file', 'test.png', 'image/png', png).headers },
    body: multipartBody('file', 'test.png', 'image/png', png).body,
  });
  const upImgData = await upImg.json();
  assert(upImg.status === 201 && upImgData.attachment.fileType === 'image', 'image upload ok & classified');

  const upDoc = await fetch(`${BASE_URL}/api/files/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${t1c}`, ...multipartBody('file', 'notes.txt', 'text/plain', 'hello world').headers },
    body: multipartBody('file', 'notes.txt', 'text/plain', 'hello world').body,
  });
  const upDocData = await upDoc.json();
  assert(upDoc.status === 201 && upDocData.attachment.fileType === 'document', 'document upload ok & classified');

  const upExe = await fetch(`${BASE_URL}/api/files/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${t1c}`, ...multipartBody('file', 'evil.exe', 'application/octet-stream', 'MZ...').headers },
    body: multipartBody('file', 'evil.exe', 'application/octet-stream', 'MZ...').body,
  });
  assert(upExe.status === 400, 'executable upload blocked');

  const noFile = await fetch(`${BASE_URL}/api/files/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${t1c}` },
  });
  assert(noFile.status === 400, 'upload without file rejected');

  // attach image to a message in DM
  const attMsg = await api(`/api/conversations/${dmId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ content: 'look at this', attachmentIds: [upImgData.attachment.id] }),
  }, t1c);
  assert(attMsg.status === 201 && attMsg.data.message.attachments.length === 1, 'attachment linked to message');

  // upload file is served
  const fileServ = await fetch(`${BASE_URL}${upImgData.attachment.url}`);
  assert(fileServ.status === 200 && fileServ.headers.get('x-content-type-options') === 'nosniff', 'uploaded file served with nosniff');

  const dlHeader = await fetch(`${BASE_URL}${upDocData.attachment.url}?download=1&name=my-notes.txt`);
  assert((dlHeader.headers.get('content-disposition') || '').includes('my-notes.txt'), 'download param sets Content-Disposition');

  // forward message with attachment (clones attachment)
  const fwd = await api(`/api/conversations/${dm3Id}/messages`, {
    method: 'POST',
    body: JSON.stringify({ content: '', forwardedFromId: id1, attachmentIds: [upImgData.attachment.id] }),
  }, t1c);
  assert(fwd.status === 201 && fwd.data.message.attachments.length === 1 && fwd.data.message.attachments[0].id !== upImgData.attachment.id, 'forward clones attachment');
  assert(fwd.data.message.forwardedFromName === 'Alpha Prime', 'forwardedFrom hydrated');

  // ---------- G. SEARCH ----------
  console.log('\nG. Search');
  const searchMsg = await api(`/api/search?q=bulk%2011`, {}, t1c);
  assert(searchMsg.status === 200 && searchMsg.data.messages.length >= 1, 'message content search');
  const searchConv = await api(`/api/search?q=bravo`, {}, t1c);
  assert(searchConv.data.conversations.some((c: any) => c.id === dmId), 'conversation found by partner name');
  const searchFile = await api(`/api/search?q=notes.txt`, {}, t1c);
  if (searchFile.data.files.length === 0) {
    // doc was uploaded but not yet shared -> attach it to a message, then re-search
    await api(`/api/conversations/${dmId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content: 'shared doc', attachmentIds: [upDocData.attachment.id] }),
    }, t1c);
  }
  const searchFile2 = await api(`/api/search?q=notes.txt`, {}, t1c);
  assert(searchFile2.data.files.length >= 1, 'file search by filename');
  const scoped = await api(`/api/search?q=bulk&conversationId=${dmId}`, {}, t1c);
  assert(scoped.status === 200 && scoped.data.messages.every((m: any) => m.conversationId === dmId), 'scoped search restricted to conversation');
  const emptySearch = await api(`/api/search?q=`, {}, t1c);
  assert(emptySearch.status === 200 && emptySearch.data.messages.length === 0, 'empty query returns empty sets');

  // ---------- H. NOTIFICATIONS ----------
  console.log('\nH. Notifications');
  const notifList = await api('/api/notifications', {}, t2);
  assert(notifList.status === 200 && Array.isArray(notifList.data.notifications), 'notifications list ok');
  const notifReadAll = await api('/api/notifications/read-all', { method: 'POST' }, t2);
  assert(notifReadAll.status === 200, 'notifications read-all ok');
  const notifAfter = await api('/api/notifications', {}, t2);
  assert(notifAfter.data.unreadCount === 0, 'unread count zero after read-all');

  // ---------- I. WEBSOCKET real-time ----------
  console.log('\nI. WebSocket Real-time');
  const alice = await collectWs(t1c);
  const bob = await collectWs(t2);
  await Promise.all([alice.ready, bob.ready]);
  await wait(300);

  // typing indicator A -> B
  alice.ws.send(JSON.stringify({ type: 'typing:start', conversationId: dmId }));
  await wait(400);
  assert(bob.events.some((e) => e.type === 'typing:update' && e.isTyping === true && e.conversationId === dmId), 'typing:start received by partner');
  alice.ws.send(JSON.stringify({ type: 'typing:stop', conversationId: dmId }));
  await wait(400);
  assert(bob.events.some((e) => e.type === 'typing:update' && e.isTyping === false), 'typing:stop received');

  // typing by non-member rejected (C not in dmId)
  const charlie = await collectWs(t3);
  await charlie.ready;
  charlie.ws.send(JSON.stringify({ type: 'typing:start', conversationId: dmId }));
  await wait(400);
  assert(!bob.events.some((e) => e.type === 'typing:update' && e.userId === id3), 'non-member typing broadcast blocked');

  // presence: A closes -> offline event for B? (only if A has no other sockets)
  const initEvt = alice.events.find((e) => e.type === 'init');
  assert(initEvt && Array.isArray(initEvt.onlineUserIds), 'init event with online list');

  // live message delivery
  const sendLive = await api(`/api/conversations/${dmId}/messages`, { method: 'POST', body: JSON.stringify({ content: 'live ws test' }) }, t1c);
  assert(sendLive.status === 201, 'live message posted');
  await wait(500);
  const bLive = bob.events.find((e) => e.type === 'message:new' && e.message.content === 'live ws test');
  assert(bLive, 'partner received message:new live');
  const aLive = alice.events.find((e) => e.type === 'message:new' && e.tempId === undefined);
  assert(aLive, 'sender received own message:new broadcast');

  // read receipt broadcast
  const readB = await api(`/api/conversations/${dmId}/read`, { method: 'POST' }, t2);
  assert(readB.status === 200, 'B marks read');
  await wait(400);
  assert(alice.events.some((e) => e.type === 'conversation:read' && e.userId === id2), 'read receipt broadcast to sender');

  // notification event to receiver (B muted? no) — B should have gotten notification:new from live message
  assert(bob.events.some((e) => e.type === 'notification:new'), 'notification:new event delivered');

  // edit broadcast
  const editLive = await api(`/api/messages/${sendLive.data.message.id}`, { method: 'PATCH', body: JSON.stringify({ content: 'edited live' }) }, t1c);
  assert(editLive.status === 200, 'edit live ok');
  await wait(400);
  assert(bob.events.some((e) => (e.type === 'message:edited' || e.type === 'message:updated') && e.message.content === 'edited live'), 'edit broadcast received');

  // group invite event: create group with B
  const grp2 = await api('/api/groups', { method: 'POST', body: JSON.stringify({ name: 'WS Group', memberIds: [id2] }) }, t1c);
  assert(grp2.status === 201, 'group 2 created');
  await wait(400);
  assert(bob.events.some((e) => e.type === 'conversation:created' && e.conversation.name === 'WS Group'), 'conversation:created pushed to added member');

  // conversation:updated broadcast on group edit
  await api(`/api/groups/${grp2.data.conversation.id}`, { method: 'PATCH', body: JSON.stringify({ description: 'changed' }) }, t1c);
  await wait(400);
  assert(bob.events.some((e) => e.type === 'conversation:updated' && e.conversation.description === 'changed'), 'conversation:updated broadcast');

  alice.ws.close();
  bob.ws.close();
  charlie.ws.close();

  // ---------- J. HTTP plumbing / cloud routing ----------
  console.log('\nJ. HTTP Plumbing & Cloud Routing');
  const health = await api('/api/health');
  assert(health.status === 200, 'health endpoint');
  const api404 = await api('/api/nonexistent');
  assert(api404.status === 404 && api404.data.error, 'unknown /api route returns JSON 404');
  const spaFallback = await fetch(`${BASE_URL}/some/deep/client/route`);
  const spaText = await spaFallback.text();
  assert(spaFallback.status === 200 && spaText.includes('<div id="root">'), 'SPA fallback serves index for deep routes');
  const optionsPreflight = await fetch(`${BASE_URL}/api/auth/login`, { method: 'OPTIONS', headers: { Origin: 'https://example-app.com', 'Access-Control-Request-Method': 'POST' } });
  assert(optionsPreflight.status === 204 || optionsPreflight.status === 200, 'CORS preflight OK');
  assert((optionsPreflight.headers.get('access-control-allow-origin') || '') !== '', 'CORS allow-origin reflected');
  const varyOrigin = optionsPreflight.headers.get('vary') || '';
  assert(varyOrigin.toLowerCase().includes('origin'), 'Vary: Origin set for proxy caches');
  const xssHeader = await fetch(`${BASE_URL}/api/health`);
  assert(xssHeader.headers.get('x-content-type-options') === 'nosniff', 'security headers present');

  // ---------- K. Cleanup: delete accounts ----------
  console.log('\nK. Cleanup (account deletion)');
  const delWrong = await api('/api/users/me', { method: 'DELETE', body: JSON.stringify({ password: 'bad' }) }, t1c);
  assert(delWrong.status === 401, 'delete wrong password rejected');
  const del1 = await api('/api/users/me', { method: 'DELETE', body: JSON.stringify({ password: 'NewPass123!' }) }, t1c);
  const del2 = await api('/api/users/me', { method: 'DELETE', body: JSON.stringify({ password: 'Secret123!' }) }, t2);
  const del3 = await api('/api/users/me', { method: 'DELETE', body: JSON.stringify({ password: 'Secret123!' }) }, t3);
  assert(del1.status === 200 && del2.status === 200 && del3.status === 200, 'all test accounts deleted');

  const ghost = await api('/api/auth/me', {}, t1c);
  assert(ghost.status === 401, 'deleted account session invalidated');

  // ---------- L. Registration preferences (multi-step wizard payload) ----------
  console.log('\nL. Registration Onboarding Preferences');
  const prefUser = `pref_${tag}`;
  const regPref = await api('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      username: prefUser,
      displayName: 'Pref Tester',
      email: `${prefUser}@test.local`,
      password: 'PrefPass123!',
      theme: 'dark',
      chatWallpaper: 'obsidian-dunes',
      allowDirectMessages: 'contacts',
      showOnlineStatus: false,
      showReadReceipts: false,
      showTypingIndicator: false,
    }),
  });
  assert(regPref.status === 201, 'register with onboarding preferences ok');
  assert(regPref.data.user.settings.chatWallpaper === 'obsidian-dunes', 'wallpaper preference persisted');
  assert(regPref.data.user.settings.allowDirectMessages === 'contacts', 'DM policy preference persisted');
  assert(regPref.data.user.settings.showOnlineStatus === false, 'online status preference persisted');
  assert(regPref.data.user.settings.showReadReceipts === false, 'read receipts preference persisted');
  assert(regPref.data.user.settings.showTypingIndicator === false, 'typing indicator preference persisted');

  const badWallpaper = await api('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      username: `prefbad_${tag}`,
      displayName: 'Pref Bad',
      email: `prefbad_${tag}@test.local`,
      password: 'PrefPass123!',
      chatWallpaper: 'rainbow-unicorn',
    }),
  });
  assert(badWallpaper.status === 201 && badWallpaper.data.user.settings.chatWallpaper === 'solid-obsidian', 'invalid wallpaper falls back to default');

  // cleanup pref users
  await api('/api/users/me', { method: 'DELETE', body: JSON.stringify({ password: 'PrefPass123!' }) }, regPref.data.token);
  const badTok = badWallpaper.data.token;
  await api('/api/users/me', { method: 'DELETE', body: JSON.stringify({ password: 'PrefPass123!' }) }, badTok);

  console.log('\n==========================================');
  console.log(`EXTENDED SUITE: ${passed} passed, ${failed} failed`);
  if (failures.length) {
    console.log('\nFAILURES:');
    failures.forEach((f) => console.log(`  - ${f}`));
    process.exit(1);
  } else {
    console.log('ALL EXTENDED TESTS PASSED ✅');
  }
}

main().catch((err) => {
  console.error('❌ Extended suite crashed:', err);
  process.exit(1);
});
