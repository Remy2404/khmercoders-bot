// Types for Discord webhook data

/**
 * Represents an embed in a Discord message
 */
export interface Embed {
  title?: string;
  description?: string;
  color?: number;
  fields?: {
    name: string;
    value: string;
    inline?: boolean;
  }[];
  // Add other embed properties as needed
}

/**
 * Simplified Discord webhook payload structure
 */
export interface DiscordWebhookPayload {
  user_id: string;
  username: string;
  content: string;
  avatar_url: string;
  embeds?: Embed[];
}
