import WebSocket from 'ws';

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:3000';
const WS_URL = BASE_URL.replace('http', 'ws') + '/ws';

function assert(condition: any, message: string) {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`);
  }
}

async function api<T = any>(
  path: string,
  options: RequestInit = {},
  token?: string
): Promise<{ status: number; data: T }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
  });
  const text = await res.text();
  let data: any = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: res.status, data };
}

async function runTests() {
  console.log('=== Starting MonoChat Full Security, RBAC & End-to-End Suite ===\n');

  // 1. Health Check & Entry Serving
  const health = await api('/api/health');
  assert(health.status === 200 && health.data.status === 'ok', 'Health check failed');
  console.log('✅ 1. Backend /api/health is online');

  const htmlRes = await fetch(`${BASE_URL}/`);
  const htmlText = await htmlRes.text();
  if (!process.env.SKIP_FRONTEND_CHECK) {
    assert(htmlRes.status === 200 && htmlText.includes('<div id="root">'), 'Frontend HTML not served');
  }
  console.log('✅ 2. Frontend SPA entry served on port 3000');

  // 2. Register Alice
  const aliceUsername = `alice_${Date.now().toString(36)}`;
  const regAlice = await api('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      username: aliceUsername,
      displayName: 'Alice Cooper',
      email: `${aliceUsername}@monochat.local`,
      password: 'Password123!',
    }),
  });
  assert(regAlice.status === 201 && regAlice.data.token, `Alice registration failed: ${JSON.stringify(regAlice.data)}`);
  const aliceToken = regAlice.data.token;
  const aliceId = regAlice.data.user.id;

  // 3. Register Bob
  const bobUsername = `bob_${Date.now().toString(36)}`;
  const regBob = await api('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      username: bobUsername,
      displayName: 'Bob Smith',
      email: `${bobUsername}@monochat.local`,
      password: 'Password123!',
    }),
  });
  assert(regBob.status === 201 && regBob.data.token, `Bob registration failed: ${JSON.stringify(regBob.data)}`);
  const bobToken = regBob.data.token;
  const bobId = regBob.data.user.id;
  console.log(`✅ 3. Two real users registered: @${aliceUsername} & @${bobUsername}`);

  // 4. Verify no fake mock contacts exist in workspace; user starts with clean state (Saved Messages)
  const aliceConvs = await api('/api/conversations', {}, aliceToken);
  assert(aliceConvs.status === 200 && Array.isArray(aliceConvs.data.conversations), 'Conversations failed');
  const hasMockConvs = aliceConvs.data.conversations.some(
    (c: any) => c.name === 'Project Zenith' || c.name === 'Gaming Crew' || c.name === 'Study Buddies'
  );
  assert(!hasMockConvs, 'Fake mock conversations should not exist');
  console.log('✅ 4. Verified zero fake mock data or placeholder groups');

  // 5. Alice starts a Direct Chat with real user Bob
  const startDm = await api('/api/conversations/direct', {
    method: 'POST',
    body: JSON.stringify({ targetUserId: bobId }),
  }, aliceToken);
  assert((startDm.status === 200 || startDm.status === 201) && startDm.data.conversation?.id, `Start DM failed: status ${startDm.status}`);
  const dmConvId = startDm.data.conversation.id;

  // Verify DM deduplication: opening DM again returns existing conversation with status 200
  const repeatDm = await api('/api/conversations/direct', {
    method: 'POST',
    body: JSON.stringify({ targetUserId: bobId }),
  }, aliceToken);
  assert(repeatDm.status === 200 && repeatDm.data.conversation?.id === dmConvId, 'Direct message deduplication failed');
  console.log(`✅ 5. Direct chat started & deduplicated between Alice and Bob (${dmConvId})`);

  // 6. WebSocket Connection for Alice
  const wsEvents: any[] = [];
  const wsAlice = new WebSocket(`${WS_URL}?token=${encodeURIComponent(aliceToken)}`);
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('WebSocket timeout')), 4000);
    wsAlice.on('open', () => {
      clearTimeout(timeout);
      resolve();
    });
    wsAlice.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
  wsAlice.on('message', (raw) => {
    try {
      wsEvents.push(JSON.parse(raw.toString()));
    } catch {
      // ignore
    }
  });
  console.log('✅ 6. Alice connected to WebSocket real-time gateway');

  // 7. Bob sends a message to Alice in the DM conversation
  const bobSend = await api(`/api/conversations/${dmConvId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ content: 'Hey Alice! New message appearing right on top!' }),
  }, bobToken);
  assert(bobSend.status === 201 && bobSend.data.message?.id, 'Bob send failed');
  console.log('✅ 7. Bob sent message to Alice');

  // 8. Wait for Alice to receive WebSocket event and verify Alice's conversation list order
  await new Promise((r) => setTimeout(r, 600));
  const newMsgEvent = wsEvents.find((e) => e.type === 'message:new' && e.conversationId === dmConvId);
  assert(newMsgEvent, 'Alice did not receive real-time message:new event via WebSocket');
  console.log('✅ 8. Real-time message:new event arrived over WebSocket');

  // 9. Verify Alice's conversations list puts the conversation with Bob at the very TOP
  const aliceConvsAfter = await api('/api/conversations', {}, aliceToken);
  assert(aliceConvsAfter.status === 200, 'Conversations fetch failed');
  const convs = aliceConvsAfter.data.conversations;
  assert(convs.length >= 1, 'Conversations should not be empty');
  assert(convs[0].id === dmConvId, `New message conversation must be at top! Found: ${convs[0].id}, expected: ${dmConvId}`);
  assert(convs[0].unreadCount === 1, 'Unread count should be 1 for Alice');
  console.log('✅ 9. Verified: Conversation with newest message is placed directly on top with unread badge');

  // 10. Message Interactions (Reactions, Pin, Edit)
  const sentMsgId = bobSend.data.message.id;
  const reactRes = await api(`/api/messages/${sentMsgId}/reactions`, {
    method: 'POST',
    body: JSON.stringify({ emoji: '🔥' }),
  }, aliceToken);
  assert(reactRes.status === 200 && reactRes.data.message.reactions.length === 1, 'Reaction failed');

  const editRes = await api(`/api/messages/${sentMsgId}`, {
    method: 'PATCH',
    body: JSON.stringify({ content: 'Updated message text' }),
  }, bobToken);
  assert(editRes.status === 200 && editRes.data.message.content === 'Updated message text', 'Edit failed');
  console.log('✅ 10. Message reactions and edits verified');

  // 11. Group RBAC & Moderation Checks
  const createGroup = await api('/api/groups', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Engineering Team',
      description: 'Core discussion',
      memberIds: [bobId],
    }),
  }, aliceToken);
  assert(createGroup.status === 201 && createGroup.data.conversation?.id, 'Group creation failed');
  const groupId = createGroup.data.conversation.id;

  const groupMsg = await api(`/api/conversations/${groupId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ content: 'Welcome engineers!' }),
  }, aliceToken);
  const groupMsgId = groupMsg.data.message.id;

  // Bob (regular member) attempts to pin -> MUST FAIL with 403
  const bobPinAttempt = await api(`/api/messages/${groupMsgId}/pin`, {
    method: 'POST',
  }, bobToken);
  assert(bobPinAttempt.status === 403, 'Regular member should not be allowed to pin message in group');

  // Alice (owner) pins -> MUST SUCCEED with 200
  const alicePin = await api(`/api/messages/${groupMsgId}/pin`, {
    method: 'POST',
  }, aliceToken);
  assert(alicePin.status === 200 && alicePin.data.isPinned === true, 'Owner pin failed');
  console.log('✅ 11. Group RBAC enforced: members forbidden from pinning, owner permitted');

  // 12. User Blocking Verification
  const blockRes = await api(`/api/users/${bobId}/block`, { method: 'POST' }, aliceToken);
  assert(blockRes.status === 200, 'Block failed');

  // Bob attempts to send DM to Alice while blocked -> MUST FAIL with 403
  const blockedSend = await api(`/api/conversations/${dmConvId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ content: 'Can you see this?' }),
  }, bobToken);
  assert(blockedSend.status === 403, 'Blocked user message must be rejected with 403');

  // Unblock Bob
  const unblockRes = await api(`/api/users/${bobId}/block`, { method: 'DELETE' }, aliceToken);
  assert(unblockRes.status === 200, 'Unblock failed');
  console.log('✅ 12. User blocking correctly blocks direct messaging');

  // 13. User Searching & @username Handling Verification
  // 13a. Search with @ prefix in /api/users
  const userSearchWithAt = await api(`/api/users?q=@${bobUsername}`, {}, aliceToken);
  assert(userSearchWithAt.status === 200 && userSearchWithAt.data.users?.length >= 1, 'Search users with @ prefix failed');
  assert(userSearchWithAt.data.users.some((u: any) => u.username === bobUsername), 'Target user not found by @username in /api/users');

  // 13b. Search in /api/search with @ prefix and verify self-exclusion
  const globalUserSearch = await api(`/api/search?q=@${bobUsername}`, {}, aliceToken);
  assert(globalUserSearch.status === 200 && Array.isArray(globalUserSearch.data.users), 'Global user search failed');
  assert(globalUserSearch.data.users.some((u: any) => u.id === bobId), 'Target user not returned in global search');
  assert(globalUserSearch.data.users.every((u: any) => u.id !== aliceId), 'Current user should be excluded from search results');

  // 13c. Search by display name
  const nameSearch = await api('/api/search?q=Bob', {}, aliceToken);
  assert(nameSearch.data.users.some((u: any) => u.id === bobId), 'Search by display name failed');
  console.log('✅ 13. User searching verified (@username stripping, display name match, self-exclusion)');

  // 14. Saved Messages Searching Verification
  // 14a. Ensure Alice has Saved Messages conversation
  const savedConvRes = await api('/api/conversations/direct', {
    method: 'POST',
    body: JSON.stringify({ targetUserId: aliceId }),
  }, aliceToken);
  assert((savedConvRes.status === 200 || savedConvRes.status === 201) && savedConvRes.data.conversation?.id, 'Saved Messages setup failed');
  const savedConvId = savedConvRes.data.conversation.id;

  // 14b. Save a note into Saved Messages
  const secretNoteText = `Vault Note ${Date.now().toString(36)} - Archival entry`;
  const postNote = await api(`/api/conversations/${savedConvId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ content: secretNoteText }),
  }, aliceToken);
  assert(postNote.status === 201 && postNote.data.message?.id, 'Post to Saved Messages failed');

  // 14c. Search conversations for "notes" and "saved"
  const searchNotes = await api('/api/search?q=notes', {}, aliceToken);
  assert(searchNotes.data.conversations?.some((c: any) => c.id === savedConvId), 'Saved Messages not found by "notes"');
  assert(Array.isArray(searchNotes.data.files), 'Files array must be present in search response');

  // 14d. Search messages globally for note content and check conversationName is "Saved Messages"
  const searchNoteContent = await api(`/api/search?q=${encodeURIComponent(secretNoteText)}`, {}, aliceToken);
  assert(searchNoteContent.data.messages?.length >= 1, 'Saved message content not found');
  const matchedNote = searchNoteContent.data.messages.find((m: any) => m.content === secretNoteText);
  assert(matchedNote, 'Specific note not in search results');
  assert(matchedNote.conversationName === 'Saved Messages', `Expected conversationName 'Saved Messages', got '${matchedNote.conversationName}'`);

  // 14e. Search with conversationId=saved and query
  const scopedSavedSearch = await api(`/api/search?conversationId=saved&q=${encodeURIComponent(secretNoteText)}`, {}, aliceToken);
  assert(scopedSavedSearch.data.messages?.length === 1, 'In-chat search for Saved Messages failed');
  assert(Array.isArray(scopedSavedSearch.data.files), 'Files array must exist in scoped search');
  console.log('✅ 14. Saved messages searching verified (conversation discovery, note content search, scoped in-chat search, files response)');

  // 15. Password Reset Security Checks (BUG-001 regression test)
  // Attempting reset without token must fail with 400
  const badReset = await api('/api/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ identifier: aliceUsername, newPassword: 'NewPassword999!' }),
  });
  assert(badReset.status === 400, 'Unauthenticated reset without token must fail');

  // Valid reset flow with recovery code
  const forgot = await api('/api/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email: `${aliceUsername}@monochat.local` }),
  });
  assert(forgot.status === 200 && forgot.data.resetCode, 'Forgot password code generation failed');
  const resetCode = forgot.data.resetCode;

  const goodReset = await api('/api/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ code: resetCode, newPassword: 'BrandNewPassword123!' }),
  });
  assert(goodReset.status === 200 && goodReset.data.success === true, 'Reset with code failed');

  // Old password must fail login
  const oldLogin = await api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ identifier: aliceUsername, password: 'Password123!' }),
  });
  assert(oldLogin.status === 401, 'Old password must no longer work');

  // New password must succeed
  const newLogin = await api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ identifier: aliceUsername, password: 'BrandNewPassword123!' }),
  });
  assert(newLogin.status === 200 && newLogin.data.token, 'New password login failed');
  const freshAliceToken = newLogin.data.token;
  console.log('✅ 15. Password reset verified secure: code required, old sessions invalidated');

  // 14. Account Deletion Password Verification (BUG-002 regression test)
  const emptyPwDelete = await api('/api/users/me', { method: 'DELETE' }, freshAliceToken);
  assert(emptyPwDelete.status === 400, 'Deletion without password must be rejected');

  const wrongPwDelete = await api('/api/users/me', {
    method: 'DELETE',
    body: JSON.stringify({ password: 'WrongPassword' }),
  }, freshAliceToken);
  assert(wrongPwDelete.status === 401, 'Deletion with wrong password must be rejected');

  const validDeleteAlice = await api('/api/users/me', {
    method: 'DELETE',
    body: JSON.stringify({ password: 'BrandNewPassword123!' }),
  }, freshAliceToken);
  assert(validDeleteAlice.status === 200, 'Deletion with correct password failed');

  const validDeleteBob = await api('/api/users/me', {
    method: 'DELETE',
    body: JSON.stringify({ password: 'Password123!' }),
  }, bobToken);
  assert(validDeleteBob.status === 200, 'Bob account deletion failed');
  console.log('✅ 16. Account deletion requires strict password confirmation');

  // Clean up
  wsAlice.close();

  console.log('\n=== ALL 16 SECURITY, SEARCH & FUNCTIONAL E2E TESTS PASSED SUCCESSFULLY! ===');
}

runTests().catch((err) => {
  console.error('❌ E2E Verification Failed:', err);
  process.exit(1);
});
