import { Hono } from 'hono';
import { DiscordWebhookPayload } from './types/discord';
import { handleTelegramWebhook } from './handlers/telegramHandler';
import { countUserMessage } from './utils/db-helpers';

const app = new Hono<{ Bindings: CloudflareBindings }>();

app.get('/', c => {
  return c.text('Welcome to KhmerCoders Chatbot');
});

// Handle Telegram webhook requests
app.post('/telegram/webhook', handleTelegramWebhook);

// Handle Discord webhook requests
app.post('/discord/webhook', async c => {
  try {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] Received Discord webhook request`);

    // Parse the incoming webhook data
    const payload: DiscordWebhookPayload = await c.req.json();

    // Early return if no message data or user ID found
    if (!payload || !payload.username || !payload.user_id) {
      console.log(`[${timestamp}] No valid message data found in the Discord webhook payload`);
      return c.json({ success: false, error: 'No valid message data found' });
    }

    // Use the username as the display name
    const displayName = payload.username || 'Unknown Discord User';

    // Use the user_id directly as a string
    const userId = payload.user_id;

    const text = payload.content || '';

    console.log(
      `[${timestamp}] Processing message from Discord user: ${displayName} (ID: ${payload.user_id})`
    );

    // Track the message in our database
    await countUserMessage(c.env.DB, 'discord', userId, displayName, text.length);

    console.log(`[${timestamp}] Successfully tracked message from Discord user: ${displayName}`);
    return c.json({ success: true });
  } catch (error) {
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}] Error processing Discord webhook:`, error);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

export default app;
