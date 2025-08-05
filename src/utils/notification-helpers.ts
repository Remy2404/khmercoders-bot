import { sendTelegramMessage } from './telegram-helpers';
import { notificationConfig, notificationTemplates } from '../config/notifications';
import { GitHubWebhookPayload, NotificationRule } from '../types/github';

/**
 * Format and send GitHub notification to Telegram
 *
 * @param db - D1Database instance
 * @param botToken - Telegram bot token
 * @param eventType - GitHub event type (e.g., 'pull_request.opened')
 * @param data - Processed notification data
 * @param template - Template type to use
 * @param channels - Target channel IDs
 */
export async function sendGitHubNotification(
  db: D1Database,
  botToken: string,
  eventType: string,
  data: any,
  template: string,
  channels: string[]
): Promise<void> {
  try {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] Sending GitHub notification: ${eventType} to channels: ${channels.join(', ')}`);

    // Get the template function
    const templateCategory = notificationTemplates[template as keyof typeof notificationTemplates];
    if (!templateCategory) {
      console.error(`[${timestamp}] Template category not found: ${template}`);
      return;
    }

    // Determine which template variant to use
    let templateFunction;
    if (eventType.includes('pull_request.opened')) {
      templateFunction = (templateCategory as any).pr_opened || (templateCategory as any).default;
    } else if (eventType.includes('pull_request.closed')) {
      templateFunction = (templateCategory as any).pr_closed || (templateCategory as any).default;
    } else if (eventType.includes('issues.opened')) {
      templateFunction = (templateCategory as any).issue_opened || (templateCategory as any).default;
    } else if (eventType.includes('issues.closed')) {
      templateFunction = (templateCategory as any).issue_closed || (templateCategory as any).default;
    } else {
      templateFunction = (templateCategory as any).default;
    }

    if (!templateFunction) {
      console.error(`[${timestamp}] Template function not found for: ${eventType}`);
      return;
    }

    // Generate the message
    const message = templateFunction(data);
    console.log(`[${timestamp}] Generated message:`, message);

    // Create a hash of the notification content to prevent duplicates
    const dataHash = await generateNotificationHash(eventType, data, message);

    // Send to each channel
    for (const channelKey of channels) {
      try {
        const channelConfig = notificationConfig.channels[channelKey];
        if (!channelConfig?.chatId) {
          console.warn(`[${timestamp}] Channel config not found or missing chatId: ${channelKey}`);
          continue;
        }

        // Check if we've already sent this notification
        const existingNotification = await db
          .prepare(
            `SELECT id FROM github_notifications 
             WHERE event_type = ? AND github_id = ? AND notification_type = ? AND data_hash = ?`
          )
          .bind(eventType, data.id || data.number, template, dataHash)
          .first();

        if (existingNotification) {
          console.log(`[${timestamp}] Notification already sent, skipping duplicate`);
          continue;
        }

        // Send the message
        const response = await sendTelegramMessage(
          botToken,
          channelConfig.chatId,
          message
        );

        if (response.ok) {
          // Record the notification in database
          await db
            .prepare(
              `INSERT INTO github_notifications 
               (event_type, github_id, notification_type, chat_id, sent_at, data_hash)
               VALUES (?, ?, ?, ?, ?, ?)`
            )
            .bind(
              eventType,
              data.id || data.number,
              template,
              channelConfig.chatId,
              timestamp,
              dataHash
            )
            .run();

          console.log(`[${timestamp}] Successfully sent notification to channel: ${channelKey}`);
        } else {
          console.error(`[${timestamp}] Failed to send notification to channel: ${channelKey}`, await response.text());
        }
      } catch (channelError) {
        console.error(`[${timestamp}] Error sending to channel ${channelKey}:`, channelError);
      }
    }
  } catch (error) {
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}] Error in sendGitHubNotification:`, error);
  }
}

/**
 * Process GitHub webhook and determine which notifications to send
 *
 * @param db - D1Database instance
 * @param botToken - Telegram bot token
 * @param eventType - GitHub event type
 * @param payload - GitHub webhook payload
 * @param env - Environment variables
 */
export async function processGitHubNotification(
  db: D1Database,
  botToken: string,
  eventType: string,
  payload: GitHubWebhookPayload,
  env: CloudflareBindings
): Promise<void> {
  try {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] Processing GitHub notification: ${eventType}`);

    // Set channel IDs from environment variables
    notificationConfig.channels.kc_dev.chatId = env.KC_DEV_CHAT_ID || '';

    // Extract common data from payload
    const commonData = extractCommonData(payload);

    // Find matching notification rules
    const matchingRules = findMatchingRules(eventType, commonData);

    // Process each matching rule
    for (const rule of matchingRules) {
      if (!rule.enabled) continue;

      // Prepare notification data based on template type
      let notificationData;
      switch (rule.template) {
        case 'smart_alert':
          notificationData = prepareSmartAlertData(payload, commonData);
          break;
        case 'security_alert':
          notificationData = prepareSecurityAlertData(payload, commonData);
          break;
        case 'design_alert':
          notificationData = prepareDesignAlertData(payload, commonData);
          break;
        case 'review_request':
          notificationData = prepareReviewRequestData(payload, commonData);
          break;
        case 'mention_alert':
          notificationData = await prepareMentionAlertData(payload, commonData, db);
          break;
        default:
          notificationData = commonData;
      }

      if (notificationData) {
        await sendGitHubNotification(
          db,
          botToken,
          eventType,
          notificationData,
          rule.template,
          rule.channels
        );
      }
    }

    // Update PR tracking if it's a PR event
    if (eventType.startsWith('pull_request') && 'pull_request' in payload) {
      await updatePRTracking(db, payload as any);
    }
  } catch (error) {
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}] Error processing GitHub notification:`, error);
  }
}

/**
 * Extract common data from GitHub webhook payload
 */
function extractCommonData(payload: GitHubWebhookPayload): any {
  const repository = payload.repository;
  
  if ('pull_request' in payload) {
    const pr = payload.pull_request;
    return {
      id: pr.id,
      number: pr.number,
      title: pr.title,
      author: pr.user.login,
      url: pr.html_url,
      repository: repository.full_name,
      labels: pr.labels.map(l => l.name),
      state: pr.state,
      merged: pr.merged,
      draft: pr.draft
    };
  } else if ('issue' in payload) {
    const issue = payload.issue;
    return {
      id: issue.id,
      number: issue.number,
      title: issue.title,
      author: issue.user.login,
      url: issue.html_url,
      repository: repository.full_name,
      labels: issue.labels.map(l => l.name),
      state: issue.state
    };
  }

  return {};
}

/**
 * Find notification rules that match the event and conditions
 */
function findMatchingRules(eventType: string, data: any): NotificationRule[] {
  return notificationConfig.rules.filter(rule => {
    // Check if event type matches
    if (rule.eventType !== eventType) return false;

    // Check conditions if they exist
    if (rule.conditions) {
      const { labels, authors, branches } = rule.conditions;
      
      if (labels && labels.length > 0) {
        const hasMatchingLabel = labels.some(label => 
          data.labels?.includes(label.toLowerCase())
        );
        if (!hasMatchingLabel) return false;
      }
      
      if (authors && authors.length > 0) {
        if (!authors.includes(data.author)) return false;
      }
      
      // Add branch checking logic if needed
    }

    return true;
  });
}

/**
 * Prepare data for smart alert notifications
 */
function prepareSmartAlertData(payload: GitHubWebhookPayload, commonData: any): any {
  const data = { ...commonData };
  
  if ('pull_request' in payload) {
    data.summary = payload.pull_request.body ? 
      payload.pull_request.body.substring(0, 200) + (payload.pull_request.body.length > 200 ? '...' : '') :
      'No description provided';
    data.status = payload.pull_request.draft ? 'Draft' : 'Ready for Review';
    data.type = 'PR';
  } else if ('issue' in payload) {
    data.summary = payload.issue.body ? 
      payload.issue.body.substring(0, 200) + (payload.issue.body.length > 200 ? '...' : '') :
      'No description provided';
    data.type = 'Issue';
  }

  return data;
}

/**
 * Prepare data for security alert notifications
 */
function prepareSecurityAlertData(payload: GitHubWebhookPayload, commonData: any): any {
  const securityLabels = commonData.labels?.filter((label: string) => 
    ['security', 'vulnerability', 'critical'].includes(label.toLowerCase())
  );

  return {
    ...commonData,
    securityLabels,
    type: 'pull_request' in payload ? 'PR' : 'Issue'
  };
}

/**
 * Prepare data for design alert notifications
 */
function prepareDesignAlertData(payload: GitHubWebhookPayload, commonData: any): any {
  const designLabels = commonData.labels?.filter((label: string) => 
    ['ux', 'design', 'ui', 'frontend'].includes(label.toLowerCase())
  );

  return {
    ...commonData,
    designLabels,
    type: 'pull_request' in payload ? 'PR' : 'Issue'
  };
}

/**
 * Prepare data for review request notifications
 */
function prepareReviewRequestData(payload: GitHubWebhookPayload, commonData: any): any {
  if ('pull_request' in payload && 'requested_reviewer' in payload) {
    const reviewer = payload.requested_reviewer;
    const telegramUsername = notificationConfig.mentions[reviewer?.login || ''];
    
    return {
      ...commonData,
      reviewer: telegramUsername || `@${reviewer?.login}`,
      type: 'PR'
    };
  }
  return null;
}

/**
 * Prepare data for mention alert notifications
 */
async function prepareMentionAlertData(
  payload: GitHubWebhookPayload, 
  commonData: any, 
  db: D1Database
): Promise<any | null> {
  if (!('comment' in payload)) return null;

  const comment = payload.comment;
  const mentions = extractMentions(comment.body);
  
  if (mentions.length === 0) return null;

  // Process each mention
  for (const mention of mentions) {
    const telegramUsername = notificationConfig.mentions[mention];
    if (!telegramUsername) continue;

    // Store mention in database
    try {
      await db
        .prepare(
          `INSERT OR IGNORE INTO github_mentions 
           (github_id, mentioned_user, mentioner, context, created_at)
           VALUES (?, ?, ?, ?, ?)`
        )
        .bind(
          commonData.number.toString(),
          mention,
          comment.user.login,
          comment.body.substring(0, 200),
          new Date().toISOString()
        )
        .run();
    } catch (error) {
      console.error('Error storing mention:', error);
    }

    // Return notification data for the first mention
    return {
      ...commonData,
      mentionedUser: telegramUsername,
      mentioner: comment.user.login,
      context: comment.body.substring(0, 100) + (comment.body.length > 100 ? '...' : ''),
      type: 'pull_request' in payload ? 'PR' : 'Issue'
    };
  }

  return null;
}

/**
 * Extract @mentions from text
 */
function extractMentions(text: string): string[] {
  const mentionRegex = /@([a-zA-Z0-9_-]+)/g;
  const mentions: string[] = [];
  let match;
  
  while ((match = mentionRegex.exec(text)) !== null) {
    mentions.push(match[1]);
  }
  
  return [...new Set(mentions)]; // Remove duplicates
}

/**
 * Update PR tracking in database
 */
async function updatePRTracking(db: D1Database, payload: any): Promise<void> {
  try {
    const pr = payload.pull_request;
    const timestamp = new Date().toISOString();
    
    await db
      .prepare(
        `INSERT OR REPLACE INTO github_pr_tracking 
         (pr_number, repository, author, title, state, created_at, updated_at, 
          reviewers, labels, last_activity_at, review_requested_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        pr.number,
        payload.repository.full_name,
        pr.user.login,
        pr.title,
        pr.merged ? 'merged' : pr.state,
        pr.created_at,
        pr.updated_at,
        JSON.stringify(pr.requested_reviewers.map((r: any) => r.login)),
        JSON.stringify(pr.labels.map((l: any) => l.name)),
        timestamp,
        pr.requested_reviewers.length > 0 ? timestamp : null
      )
      .run();
  } catch (error) {
    console.error('Error updating PR tracking:', error);
  }
}

/**
 * Generate a hash for notification content to prevent duplicates
 */
async function generateNotificationHash(eventType: string, data: any, message: string): Promise<string> {
  const content = `${eventType}-${data.id || data.number}-${message}`;
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(content));
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16);
}
