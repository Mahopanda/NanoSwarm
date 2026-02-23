export interface Attachment {
  name: string;
  mimeType: string;
  data: string | Buffer;
}

export interface NormalizedMessage {
  channelId: string;
  userId: string;
  conversationId: string;
  text: string;
  attachments?: Attachment[];
  metadata?: Record<string, unknown>;
}

export interface NormalizedResponse {
  text: string;
  attachments?: Attachment[];
  metadata?: Record<string, unknown>;
}

export interface MessageHandler {
  handle(message: NormalizedMessage): Promise<NormalizedResponse>;
}

export interface Channel {
  readonly id: string;
  readonly name: string;
}
