export type User = {
  id: string;
  handle: string;
  displayName: string;
  createdAt: string;
};

export type Chat = {
  chatId: string;
  memberIds: [string, string];
  lastSeenMessages: Record<string, string>;
  createdAt: string;
};

export type MessagePayload = {
  text: string;
};

export type Message = {
  messageId: string;
  chatId: string;
  senderId: string;
  payload: MessagePayload;
  readReceipts: Record<string, string>;
  sentAt: string;
};
