type HttpResult<T> = {
  status: number;
  body: T;
};

type ApiMessage = {
  messageId?: string;
  chatId?: string;
  senderId?: string;
  payload?: { text?: string };
  readReceipts?: Record<string, string>;
  sentAt?: string;
};

type ApiChat = {
  chatId?: string;
  memberIds?: string[];
  lastSeenMessages?: Record<string, string>;
  createdAt?: string;
  created?: boolean;
};

type ApiChatsResponse = {
  chats?: ApiChat[];
};

type ApiMessagesResponse = {
  messages?: ApiMessage[];
};

type ApiLastSeenResponse = {
  chatId?: string;
  userId?: string;
  lastSeenMessageId?: string;
  lastSeenMessages?: Record<string, string>;
};

type ApiUser = {
  id?: string;
  handle?: string;
};

type ApiError = {
  error?: string;
};

const UNKNOWN_CHAT_ID = '00000000-0000-4000-8000-000000000000';

export async function runSmokeTests(baseUrl: string): Promise<void> {
  const failures: string[] = [];
  let passedChecks = 0;

  function check(condition: boolean, failureMessage: string): void {
    if (condition) {
      passedChecks += 1;
      return;
    }
    failures.push(failureMessage);
  }

  const uniqueSuffix = `${Date.now()}`;
  const userAId = await createTestUser(baseUrl, `smoke_${uniqueSuffix}_a`);
  const userBId = await createTestUser(baseUrl, `smoke_${uniqueSuffix}_b`);
  const outsiderId = await createTestUser(baseUrl, `smoke_${uniqueSuffix}_c`);

  const firstChat = await requestJson<ApiChat>(baseUrl, 'POST', '/chat/create', {
    userAId,
    userBId,
  });
  check(firstChat.status === 201, `First POST /chat/create should return 201, got ${firstChat.status}`);
  check(firstChat.body.created === true, `First POST /chat/create should report created=true, got ${firstChat.body.created}`);
  const chatId = requireChatId(firstChat, 'POST /chat/create');
  const expectedMemberIds = userAId < userBId ? [userAId, userBId] : [userBId, userAId];
  check(
    sameValues(firstChat.body.memberIds, expectedMemberIds),
    `Chat members should be stored in canonical order, expected ${JSON.stringify(expectedMemberIds)} but got ${JSON.stringify(firstChat.body.memberIds)}`,
  );

  const reversedChat = await requestJson<ApiChat>(baseUrl, 'POST', '/chat/create', {
    userAId: userBId,
    userBId: userAId,
  });
  check(reversedChat.status === 200, `Repeated POST /chat/create should return 200, got ${reversedChat.status}`);
  check(reversedChat.body.chatId === chatId, 'Repeated POST /chat/create with reversed members should return the same chatId');
  check(reversedChat.body.created === false, `Repeated POST /chat/create should report created=false, got ${reversedChat.body.created}`);

  const secondChat = await requestJson<ApiChat>(baseUrl, 'POST', '/chat/create', {
    userAId,
    userBId: outsiderId,
  });
  check(secondChat.status === 201, `Second chat creation should return 201, got ${secondChat.status}`);
  const secondChatId = requireChatId(secondChat, 'second POST /chat/create');

  const sameUserChat = await requestJson<ApiError>(baseUrl, 'POST', '/chat/create', {
    userAId,
    userBId: userAId,
  });
  check(sameUserChat.status === 400, `Creating a chat with one user twice should return 400, got ${sameUserChat.status}`);

  const unknownUserChat = await requestJson<ApiError>(baseUrl, 'POST', '/chat/create', {
    userAId,
    userBId: UNKNOWN_CHAT_ID,
  });
  check(unknownUserChat.status === 404, `Creating a chat with an unknown user should return 404, got ${unknownUserChat.status}`);

  const messageOne = await requestJson<ApiMessage>(baseUrl, 'POST', `/chat/${chatId}/message/send`, {
    senderId: userAId,
    text: 'first message from A',
  });
  check(messageOne.status === 201, `Sending a message should return 201, got ${messageOne.status}`);
  check(messageOne.body.chatId === chatId, `Sent message should belong to chat ${chatId}, got ${messageOne.body.chatId}`);
  check(messageOne.body.senderId === userAId, `Sent message should record sender ${userAId}, got ${messageOne.body.senderId}`);
  check(messageOne.body.payload?.text === 'first message from A', `Sent message payload should contain the text, got ${JSON.stringify(messageOne.body.payload)}`);
  check(
    messageOne.body.readReceipts !== undefined && Object.keys(messageOne.body.readReceipts).length === 0,
    'A freshly sent message should have no read receipts',
  );
  const messageOneId = requireMessageId(messageOne, 'sending the first message');

  const messageTwo = await requestJson<ApiMessage>(baseUrl, 'POST', `/chat/${chatId}/message/send`, {
    senderId: userAId,
    text: 'second message from A',
  });
  const messageTwoId = requireMessageId(messageTwo, 'sending the second message');

  const messageThree = await requestJson<ApiMessage>(baseUrl, 'POST', `/chat/${chatId}/message/send`, {
    senderId: userBId,
    text: 'third message from B',
  });
  const messageThreeId = requireMessageId(messageThree, 'sending the third message');
  check(
    messageOneId !== messageTwoId && messageOneId !== messageThreeId && messageTwoId !== messageThreeId,
    'Each sent message should receive a unique messageId',
  );

  const allMessages = await requestJson<ApiMessagesResponse>(baseUrl, 'GET', `/chat/${chatId}/messages?limit=50`);
  check(allMessages.status === 200, `GET messages should return 200, got ${allMessages.status}`);
  const messages = allMessages.body.messages;
  check(Array.isArray(messages) && messages.length === 3, `GET messages should return 3 messages, got ${Array.isArray(messages) ? messages.length : 'a non-array body'}`);
  if (Array.isArray(messages) && messages.length === 3) {
    const [firstMessage, secondMessage, thirdMessage] = messages;
    check(firstMessage?.payload?.text === 'first message from A', `Messages should be ordered oldest first, first message was ${JSON.stringify(firstMessage?.payload)}`);
    check(secondMessage?.payload?.text === 'second message from A', `Messages should be ordered oldest first, second message was ${JSON.stringify(secondMessage?.payload)}`);
    check(thirdMessage?.payload?.text === 'third message from B', `Messages should be ordered oldest first, third message was ${JSON.stringify(thirdMessage?.payload)}`);
    const firstSentAt = Date.parse(firstMessage?.sentAt ?? '');
    const secondSentAt = Date.parse(secondMessage?.sentAt ?? '');
    const thirdSentAt = Date.parse(thirdMessage?.sentAt ?? '');
    check(
      Number.isFinite(firstSentAt) && Number.isFinite(secondSentAt) && Number.isFinite(thirdSentAt) && firstSentAt <= secondSentAt && secondSentAt <= thirdSentAt,
      'Message sentAt values should be valid timestamps in ascending order',
    );
  }

  const limitedMessages = await requestJson<ApiMessagesResponse>(baseUrl, 'GET', `/chat/${chatId}/messages?limit=2`);
  const limited = limitedMessages.body.messages;
  check(Array.isArray(limited) && limited.length === 2, `GET messages?limit=2 should return 2 messages, got ${Array.isArray(limited) ? limited.length : 'a non-array body'}`);
  if (Array.isArray(limited)) {
    const [firstLimitedMessage, secondLimitedMessage] = limited;
    check(
      firstLimitedMessage?.payload?.text === 'second message from A' && secondLimitedMessage?.payload?.text === 'third message from B',
      'GET messages?limit=2 should return the two most recent messages in ascending order',
    );
  }

  const zeroLimit = await requestJson<ApiError>(baseUrl, 'GET', `/chat/${chatId}/messages?limit=0`);
  check(zeroLimit.status === 400, `GET messages?limit=0 should return 400, got ${zeroLimit.status}`);
  const invalidLimit = await requestJson<ApiError>(baseUrl, 'GET', `/chat/${chatId}/messages?limit=abc`);
  check(invalidLimit.status === 400, `GET messages?limit=abc should return 400, got ${invalidLimit.status}`);
  const invalidChatParams = await requestJson<ApiError>(baseUrl, 'GET', '/chat/not-a-uuid/messages');
  check(invalidChatParams.status === 400, `GET messages with an invalid chatId should return 400, got ${invalidChatParams.status}`);
  const missingChat = await requestJson<ApiError>(baseUrl, 'GET', `/chat/${UNKNOWN_CHAT_ID}/messages`);
  check(missingChat.status === 404, `GET messages for an unknown chat should return 404, got ${missingChat.status}`);

  const outsiderSend = await requestJson<ApiError>(baseUrl, 'POST', `/chat/${chatId}/message/send`, {
    senderId: outsiderId,
    text: 'not allowed',
  });
  check(outsiderSend.status === 403, `Sending as a non-member should return 403, got ${outsiderSend.status}`);

  const emptyTextSend = await requestJson<ApiError>(baseUrl, 'POST', `/chat/${chatId}/message/send`, {
    senderId: userAId,
    text: '   ',
  });
  check(emptyTextSend.status === 400, `Sending empty text should return 400, got ${emptyTextSend.status}`);

  const readResult = await requestJson<ApiMessage>(baseUrl, 'POST', `/chat/${chatId}/message/${messageOneId}/read`, {
    userId: userBId,
  });
  check(readResult.status === 200, `Marking a message read should return 200, got ${readResult.status}`);
  check(readResult.body.readReceipts?.[userBId] !== undefined, 'Read receipt should be recorded for the reader');
  check(readResult.body.readReceipts?.[userAId] === undefined, 'Read receipt should not be recorded for the sender');

  const messagesAfterRead = await requestJson<ApiMessagesResponse>(baseUrl, 'GET', `/chat/${chatId}/messages?limit=50`);
  const messagesAfterReadList = messagesAfterRead.body.messages;
  if (Array.isArray(messagesAfterReadList)) {
    const [firstMessageAfterRead] = messagesAfterReadList;
    check(firstMessageAfterRead?.readReceipts?.[userBId] !== undefined, 'GET messages should return the stored read receipts');
  } else {
    check(false, 'GET messages after a read should still return an array');
  }

  const readWrongChat = await requestJson<ApiError>(baseUrl, 'POST', `/chat/${secondChatId}/message/${messageOneId}/read`, {
    userId: userAId,
  });
  check(readWrongChat.status === 404, `Reading a message under the wrong chat should return 404, got ${readWrongChat.status}`);

  const readUnknownMessage = await requestJson<ApiError>(baseUrl, 'POST', `/chat/${chatId}/message/${UNKNOWN_CHAT_ID}/read`, {
    userId: userAId,
  });
  check(readUnknownMessage.status === 404, `Reading an unknown message should return 404, got ${readUnknownMessage.status}`);

  const outsiderRead = await requestJson<ApiError>(baseUrl, 'POST', `/chat/${chatId}/message/${messageOneId}/read`, {
    userId: outsiderId,
  });
  check(outsiderRead.status === 403, `Reading as a non-member should return 403, got ${outsiderRead.status}`);

  const lastSeenResult = await requestJson<ApiLastSeenResponse>(baseUrl, 'POST', `/chat/${chatId}/lastseen`, {
    userId: userBId,
    messageId: messageOneId,
  });
  check(lastSeenResult.status === 200, `Updating last seen should return 200, got ${lastSeenResult.status}`);
  check(lastSeenResult.body.lastSeenMessageId === messageOneId, `Last seen should point at ${messageOneId}, got ${lastSeenResult.body.lastSeenMessageId}`);
  check(lastSeenResult.body.lastSeenMessages?.[userBId] === messageOneId, 'Last seen map should record the reader position per user');

  const lastSeenUnknownMessage = await requestJson<ApiError>(baseUrl, 'POST', `/chat/${chatId}/lastseen`, {
    userId: userBId,
    messageId: UNKNOWN_CHAT_ID,
  });
  check(lastSeenUnknownMessage.status === 404, `Last seen for an unknown message should return 404, got ${lastSeenUnknownMessage.status}`);

  const outsiderLastSeen = await requestJson<ApiError>(baseUrl, 'POST', `/chat/${chatId}/lastseen`, {
    userId: outsiderId,
    messageId: messageOneId,
  });
  check(outsiderLastSeen.status === 403, `Last seen update by a non-member should return 403, got ${outsiderLastSeen.status}`);

  const userBChats = await requestJson<ApiChatsResponse>(baseUrl, 'GET', `/user/${userBId}/chats`);
  check(userBChats.status === 200, `GET user chats should return 200, got ${userBChats.status}`);
  const userBChatList = userBChats.body.chats;
  check(Array.isArray(userBChatList) && userBChatList.length === 1, `User B should have 1 chat, got ${Array.isArray(userBChatList) ? userBChatList.length : 'a non-array body'}`);
  if (Array.isArray(userBChatList)) {
    const [userBChat] = userBChatList;
    check(userBChat?.chatId === chatId, `User B's chat list should contain chat ${chatId}`);
    check(userBChat?.lastSeenMessages?.[userBId] === messageOneId, 'User B chat entry should include the last seen message');
  }

  const userAChats = await requestJson<ApiChatsResponse>(baseUrl, 'GET', `/user/${userAId}/chats`);
  const userAChatList = userAChats.body.chats;
  check(Array.isArray(userAChatList) && userAChatList.length === 2, `User A should have 2 chats, got ${Array.isArray(userAChatList) ? userAChatList.length : 'a non-array body'}`);

  const missingUserChats = await requestJson<ApiError>(baseUrl, 'GET', `/user/${UNKNOWN_CHAT_ID}/chats`);
  check(missingUserChats.status === 404, `GET chats for an unknown user should return 404, got ${missingUserChats.status}`);

  const duplicateHandle = await requestJson<ApiError>(baseUrl, 'POST', '/users', {
    handle: `smoke_${uniqueSuffix}_a`,
    displayName: 'Duplicate Handle',
  });
  check(duplicateHandle.status === 409, `Creating a duplicate handle should return 409, got ${duplicateHandle.status}`);

  const invalidHandle = await requestJson<ApiError>(baseUrl, 'POST', '/users', {
    handle: 'no spaces allowed',
    displayName: 'Bad Handle',
  });
  check(invalidHandle.status === 400, `Creating a handle with invalid characters should return 400, got ${invalidHandle.status}`);

  const malformedBodyResponse = await fetch(`${baseUrl}/chat/create`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{"userAId":',
  });
  check(malformedBodyResponse.status === 400, `Malformed JSON bodies should return 400, got ${malformedBodyResponse.status}`);

  const unknownRoute = await requestJson<ApiError>(baseUrl, 'POST', '/does-not-exist', {});
  check(unknownRoute.status === 404, `Unknown routes should return 404, got ${unknownRoute.status}`);

  if (failures.length > 0) {
    const failureReport = failures.map((failure) => `  - ${failure}`).join('\n');
    throw new Error(`Smoke tests failed (${failures.length} of ${failures.length + passedChecks} checks):\n${failureReport}`);
  }
  console.log(`Smoke tests passed: ${passedChecks} checks.`);
}

async function createTestUser(baseUrl: string, handle: string): Promise<string> {
  const result = await requestJson<ApiUser>(baseUrl, 'POST', '/users', {
    handle,
    displayName: `Smoke test user ${handle}`,
  });
  const userId = result.body.id;
  if (result.status !== 201 || !userId) {
    throw new Error(`Smoke test setup failed: could not create user "${handle}" (status ${result.status}, body ${JSON.stringify(result.body)}).`);
  }
  return userId;
}

function requireChatId(result: HttpResult<ApiChat>, operationName: string): string {
  const chatId = result.body.chatId;
  if (!chatId) {
    throw new Error(`Smoke test setup failed: ${operationName} did not return a chatId (body ${JSON.stringify(result.body)}).`);
  }
  return chatId;
}

function requireMessageId(result: HttpResult<ApiMessage>, operationName: string): string {
  const messageId = result.body.messageId;
  if (!messageId) {
    throw new Error(`Smoke test setup failed: ${operationName} did not return a messageId (body ${JSON.stringify(result.body)}).`);
  }
  return messageId;
}

function sameValues(actual: string[] | undefined, expected: string[]): boolean {
  if (!actual || actual.length !== expected.length) {
    return false;
  }
  return actual.every((value, index) => value === expected[index]);
}

async function requestJson<T>(baseUrl: string, method: string, path: string, body?: unknown): Promise<HttpResult<T>> {
  let response: Response;
  try {
    response = await fetch(baseUrl + path, {
      method,
      headers: { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`${method} ${path} could not reach the server at ${baseUrl}: ${reason}`);
  }
  const responseText = await response.text();
  let parsedBody: T;
  try {
    parsedBody = JSON.parse(responseText) as T;
  } catch {
    throw new Error(`${method} ${path} returned non-JSON with status ${response.status}: ${responseText.slice(0, 200)}`);
  }
  return { status: response.status, body: parsedBody };
}
