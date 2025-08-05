import { Hono } from 'hono';
import { DiscordWebhookPayload } from './types/discord';
import { handleTelegramWebhook } from './handlers/telegramHandler';
import { handleGitHubWebhook, handleGitHubPing } from './handlers/githubHandler';
import { countUserMessage } from './utils/db-helpers';
import { runScheduledNotifications, getNotificationSystemStatus } from './notifications/notificationScheduler';

const app = new Hono<{ Bindings: CloudflareBindings }>();

app.get('/', c => {
  return c.text('Welcome to KhmerCoders Chatbot');
});

// Handle Telegram webhook requests
app.post('/telegram/webhook', handleTelegramWebhook);

// Handle GitHub webhook requests
app.post('/github/webhook', handleGitHubWebhook);

// Handle GitHub ping/test events
app.post('/github/ping', handleGitHubPing);

// Scheduled notifications endpoint (for cron jobs)
app.post('/notifications/scheduled', async c => {
  try {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] Running scheduled notifications`);

    await runScheduledNotifications(
      c.env.DB,
      c.env.TELEGRAM_BOT_TOKEN,
      c.env
    );

    return c.json({ 
      success: true, 
      message: 'Scheduled notifications completed',
      timestamp 
    });
  } catch (error) {
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}] Error in scheduled notifications:`, error);
    return c.json({ 
      success: false, 
      error: 'Internal server error',
      timestamp 
    }, 500);
  }
});

// Notification system status endpoint
app.get('/notifications/status', async c => {
  try {
    const status = await getNotificationSystemStatus(c.env.DB);
    return c.json({
      success: true,
      ...status,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error getting notification status:', error);
    return c.json({ 
      success: false, 
      error: 'Internal server error' 
    }, 500);
  }
});

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

// Cron trigger handler for scheduled notifications
app.post('/cron', async c => {
  try {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] Cron trigger activated`);

    await runScheduledNotifications(
      c.env.DB,
      c.env.TELEGRAM_BOT_TOKEN,
      c.env
    );

    return c.json({ 
      success: true, 
      message: 'Cron notifications completed',
      timestamp 
    });
  } catch (error) {
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}] Error in cron notifications:`, error);
    return c.json({ 
      success: false, 
      error: 'Internal server error',
      timestamp 
    }, 500);
  }
});

export default app;

// Cron event handler (for Cloudflare Workers cron triggers)
export async function scheduled(
  controller: ScheduledController,
  env: CloudflareBindings,
  ctx: ExecutionContext
): Promise<void> {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] Scheduled event triggered: ${controller.cron}`);

  try {
    await runScheduledNotifications(
      env.DB,
      env.TELEGRAM_BOT_TOKEN,
      env
    );
    console.log(`[${timestamp}] Scheduled notifications completed successfully`);
  } catch (error) {
    console.error(`[${timestamp}] Error in scheduled notifications:`, error);
  }
}
