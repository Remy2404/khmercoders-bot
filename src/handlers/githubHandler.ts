import { Context } from 'hono';
import { GitHubWebhookPayload } from '../types/github';
import { processGitHubNotification } from '../utils/notification-helpers';
import { processAllNotifications } from '../notifications/notificationScheduler';
import { 
  verifyGitHubSignature, 
  getGitHubEventType, 
  shouldProcessWebhook,
  checkGitHubRateLimit,
  parseGitHubHeaders,
  isHighPriorityEvent 
} from '../utils/github-helpers';

/**
 * Handle incoming GitHub webhook requests
 * @param c - Hono context
 * @returns HTTP response
 */
export async function handleGitHubWebhook(
  c: Context<{ Bindings: CloudflareBindings }>
): Promise<Response> {
  try {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] Received GitHub webhook request`);

    // Parse headers
    const headers = parseGitHubHeaders((name: string) => c.req.header(name));
    console.log(`[${timestamp}] GitHub webhook headers:`, headers);

    // Get raw payload for signature verification
    const rawPayload = await c.req.text();
    
    // Verify webhook signature if secret is configured
    if (c.env.GITHUB_WEBHOOK_SECRET) {
      const isValidSignature = await verifyGitHubSignature(
        rawPayload,
        headers.signature,
        c.env.GITHUB_WEBHOOK_SECRET
      );
      
      if (!isValidSignature) {
        console.warn(`[${timestamp}] Invalid GitHub webhook signature`);
        return c.json({ error: 'Invalid signature' }, 401);
      }
      console.log(`[${timestamp}] GitHub webhook signature verified`);
    } else {
      console.warn(`[${timestamp}] GitHub webhook secret not configured - skipping signature verification`);
    }

    // Parse the JSON payload
    let payload: GitHubWebhookPayload;
    try {
      payload = JSON.parse(rawPayload);
    } catch (parseError) {
      console.error(`[${timestamp}] Error parsing GitHub webhook payload:`, parseError);
      return c.json({ error: 'Invalid JSON payload' }, 400);
    }

    // Determine event type
    const eventType = getGitHubEventType((name: string) => c.req.header(name), payload);
    console.log(`[${timestamp}] GitHub event type: ${eventType}`);

    // Check if we should process this webhook (repository filtering)
    // Empty array = process all repositories (good for testing)
    const allowedRepos: string[] = [];
    if (!shouldProcessWebhook(payload, allowedRepos)) {
      console.log(`[${timestamp}] Skipping webhook - repository not in allowed list`);
      return c.json({ success: true, message: 'Repository not monitored' });
    }

    // Rate limiting check
    const repoIdentifier = payload.repository.full_name;
    const isWithinLimits = await checkGitHubRateLimit(
      c.env.DB,
      eventType,
      repoIdentifier,
      5, // 5 minute window
      20 // Max 20 events per window
    );

    if (!isWithinLimits) {
      console.warn(`[${timestamp}] Rate limit exceeded for ${eventType}:${repoIdentifier}`);
      return c.json({ error: 'Rate limit exceeded' }, 429);
    }

    // Log the event for debugging
    console.log(`[${timestamp}] Processing GitHub event:`, {
      event: eventType,
      repository: payload.repository.full_name,
      delivery: headers.delivery
    });

    // Use waitUntil for non-blocking processing of notifications
    // Exception: High priority events are processed immediately
    if (isHighPriorityEvent(eventType)) {
      console.log(`[${timestamp}] Processing high priority event immediately: ${eventType}`);
      
      // Use the new modular notification system for high priority events
      await processAllNotifications(
        c.env.DB,
        c.env.TELEGRAM_BOT_TOKEN,
        eventType,
        payload,
        c.env
      );
    } else {
      console.log(`[${timestamp}] Queuing event for background processing: ${eventType}`);
      
      // For lower priority events, use waitUntil for background processing
      c.executionCtx.waitUntil(
        processAllNotifications(
          c.env.DB,
          c.env.TELEGRAM_BOT_TOKEN,
          eventType,
          payload,
          c.env
        )
      );
    }

    return c.json({ 
      success: true, 
      message: 'Webhook processed',
      event: eventType,
      delivery: headers.delivery 
    });

  } catch (error) {
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}] Error processing GitHub webhook:`, error);
    return c.json({ 
      success: false, 
      error: 'Internal server error',
      timestamp 
    }, 500);
  }
}

/**
 * Handle GitHub webhook test/ping events
 * @param c - Hono context  
 * @returns HTTP response
 */
export async function handleGitHubPing(
  c: Context<{ Bindings: CloudflareBindings }>
): Promise<Response> {
  try {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] Received GitHub ping webhook`);

    const payload = await c.req.json();
    console.log(`[${timestamp}] GitHub ping from repository: ${payload.repository?.full_name}`);

    // Optionally send a notification about webhook setup
    if (c.env.KC_DEV_CHAT_ID && c.env.TELEGRAM_BOT_TOKEN) {
      const { sendTelegramMessage } = await import('../utils/telegram-helpers');
      
      const message = `
🔗 <b>GitHub Webhook Connected!</b>
📂 <b>Repository:</b> ${payload.repository?.full_name || 'Unknown'}
✅ <b>Status:</b> Ready to receive notifications
🤖 <b>Notifications will be sent to this channel</b>`;

      await sendTelegramMessage(
        c.env.TELEGRAM_BOT_TOKEN,
        c.env.KC_DEV_CHAT_ID,
        message
      );
    }

    return c.json({ 
      success: true, 
      message: 'Pong! GitHub webhook is configured correctly.',
      repository: payload.repository?.full_name,
      timestamp 
    });

  } catch (error) {
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}] Error processing GitHub ping:`, error);
    return c.json({ 
      success: false, 
      error: 'Internal server error',
      timestamp 
    }, 500);
  }
}
