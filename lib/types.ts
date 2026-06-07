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
  subject?: string | null; // email subject (Outlook); absent for chat-style DMs
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

export interface Post {
  _id?: string;
  id?: string;
  postId?: string;
  platform?: string;
  accountId?: string;
  caption?: string;
  content?: string;
  message?: string;
  publishedAt?: string;
  createdAt?: string;
  commentsCount?: number;
  totalComments?: number;
  likesCount?: number;
  permalink?: string;
  url?: string;
  thumbnailUrl?: string;
  mediaUrl?: string;
}

export interface Comment {
  _id?: string;
  id?: string;
  message?: string;
  text?: string;
  body?: string;
  from?: string;
  username?: string;
  senderName?: string;
  createdAt?: string;
  direction?: "incoming" | "outgoing";
}
