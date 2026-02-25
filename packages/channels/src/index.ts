// @nanoswarm/channels — barrel export
export type { AdminProvider, AgentStatus } from './admin.ts';
export type {
  NormalizedMessage,
  NormalizedResponse,
  MessageHandler,
  Channel,
  Attachment,
} from './types.ts';
export { createRestRouter, type RestRouterOptions } from './rest.ts';

// Message Bus
export type { InboundMessage, OutboundMessage } from './messages.ts';
export { sessionKey } from './messages.ts';
export { AsyncQueue, MessageBus } from './bus.ts';

// Channel abstractions
export { BaseChannel, type ChannelConfig } from './base-channel.ts';
export { ChannelManager } from './channel-manager.ts';

// Built-in channels
export { CLIChannel, type CLIChannelConfig } from './cli-channel.ts';
export { TelegramChannel, type TelegramChannelConfig, type TelegramBotAccount, markdownToTelegramHtml, splitMessage } from './telegram/index.ts';
export { GroupFilter, type TelegramGroupConfig } from './telegram/index.ts';
export { type STTProvider, GroqSTTProvider, createSTTProvider } from './telegram/index.ts';
export { downloadTelegramFile, getMediaDir, type MediaType, type DownloadedMedia } from './telegram/index.ts';
