// Shared types between the API routes and the UI, modeled on the Zernio OpenAPI spec.

export interface Account {
  _id?: string;
  id?: string;
  accountId?: string;
  platform?: string;
  displayName?: string;
  name?: string;
  handle?: string;
}

export interface Conversation {
  id: string;
  platform: string;
  accountId: string;
  accountUsername?: string;
  participantId?: string;
  participantName?: string;
  participantPicture?: string | null;
  lastMessage?: string;
  updatedTime?: string;
  status?: "active" | "archived";
  unreadCount?: number | null;
  url?: string | null;
}

export interface Attachment {
  id?: string;
  type: "image" | "video" | "audio" | "file" | "sticker" | "share";
  url?: string;
  filename?: string | null;
  previewUrl?: string | null;
}

export interface Message {
  id: string;
  message?: string;
  senderId?: string;
  senderName?: string | null;
  direction: "incoming" | "outgoing";
  createdAt?: string;
  attachments?: Attachment[];
  deliveryStatus?: "sent" | "delivered" | "read" | "failed" | "deleted" | null;
  storyReply?: boolean | null;
}

export interface ConversationsMeta {
  accountsQueried?: number;
  accountsFailed?: number;
  failedAccounts?: { platform?: string; accountUsername?: string | null; error?: string }[];
}

export interface AnalyticsOverview {
  totalPosts?: number;
  publishedPosts?: number;
  scheduledPosts?: number;
  lastSync?: string;
}
