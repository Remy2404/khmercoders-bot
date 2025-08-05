import { GitHubWebhookPayload } from '../types/github';
import { sendGitHubNotification } from '../utils/notification-helpers';
import { notificationConfig } from '../config/notifications';

/**
 * DevMentions Alert - Notify team members when they're mentioned in PRs/Issues
 * Handles: @mentions in PR/Issue descriptions, comments, reviews
 */

export interface MentionAlertData {
  id: number;
  number: number;
  title: string;
  url: string;
  type: 'PR' | 'Issue';
  mentionedUser: string;
  mentionedTelegramUser: string;
  mentioner: string;
  context: string;
  repository: string;
  commentUrl?: string;
  actionRequired?: boolean;
  canAcknowledge?: boolean;
}

/**
 * Process mention alerts for PR/Issue events
 *
 * @param db - D1Database instance
 * @param botToken - Telegram bot token
 * @param eventType - GitHub event type
 * @param payload - GitHub webhook payload
 * @param targetChannels - Array of channel keys to send to
 */
export async function processMentionAlert(
  db: D1Database,
  botToken: string,
  eventType: string,
  payload: GitHubWebhookPayload,
  targetChannels: string[]
): Promise<void> {
  try {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] Processing mention alert for: ${eventType}`);

    const mentions = await extractMentionsFromPayload(payload, db);
    
    if (mentions.length === 0) {
      console.log(`[${timestamp}] No mentions found in: ${eventType}`);
      return;
    }

    // Process each mention separately
    for (const mentionData of mentions) {
      await sendGitHubNotification(
        db,
        botToken,
        eventType,
        mentionData,
        'mention_alert',
        targetChannels
      );
    }

    console.log(`[${timestamp}] Processed ${mentions.length} mention alerts`);
  } catch (error) {
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}] Error processing mention alert:`, error);
  }
}

/**
 * Extract mentions from various parts of the GitHub payload
 */
async function extractMentionsFromPayload(
  payload: GitHubWebhookPayload, 
  db: D1Database
): Promise<MentionAlertData[]> {
  const mentions: MentionAlertData[] = [];
  
  try {
    // Extract base information
    const baseInfo = getBaseInfo(payload);
    if (!baseInfo) return mentions;

    // Check for mentions in different parts of the payload
    if ('pull_request' in payload) {
      // PR description mentions
      if (payload.pull_request.body) {
        const prMentions = findMentions(payload.pull_request.body);
        for (const mention of prMentions) {
          const mentionData = await createMentionData(
            baseInfo,
            mention,
            payload.pull_request.user.login,
            payload.pull_request.body,
            db
          );
          if (mentionData) mentions.push(mentionData);
        }
      }
    } else if ('issue' in payload) {
      // Issue description mentions
      if (payload.issue.body) {
        const issueMentions = findMentions(payload.issue.body);
        for (const mention of issueMentions) {
          const mentionData = await createMentionData(
            baseInfo,
            mention,
            payload.issue.user.login,
            payload.issue.body,
            db
          );
          if (mentionData) mentions.push(mentionData);
        }
      }
    }

    // Comment mentions (for issue_comment events)
    if ('comment' in payload) {
      const commentMentions = findMentions(payload.comment.body);
      for (const mention of commentMentions) {
        const mentionData = await createMentionData(
          baseInfo,
          mention,
          payload.comment.user.login,
          payload.comment.body,
          db,
          payload.comment.html_url
        );
        if (mentionData) mentions.push(mentionData);
      }
    }

    // Review mentions (for pull_request_review events)
    if ('review' in payload && payload.review.body) {
      const reviewMentions = findMentions(payload.review.body);
      for (const mention of reviewMentions) {
        const mentionData = await createMentionData(
          baseInfo,
          mention,
          payload.review.user.login,
          payload.review.body,
          db,
          payload.review.html_url
        );
        if (mentionData) mentions.push(mentionData);
      }
    }

  } catch (error) {
    console.error('Error extracting mentions from payload:', error);
  }

  return mentions;
}

/**
 * Extract base information from payload
 */
function getBaseInfo(payload: GitHubWebhookPayload): any {
  if ('pull_request' in payload) {
    return {
      id: payload.pull_request.id,
      number: payload.pull_request.number,
      title: payload.pull_request.title,
      url: payload.pull_request.html_url,
      type: 'PR' as const,
      repository: payload.repository.full_name
    };
  } else if ('issue' in payload) {
    return {
      id: payload.issue.id,
      number: payload.issue.number,
      title: payload.issue.title,
      url: payload.issue.html_url,
      type: 'Issue' as const,
      repository: payload.repository.full_name
    };
  }
  
  return null;
}

/**
 * Find @mentions in text content
 */
function findMentions(text: string): string[] {
  const mentionRegex = /@([a-zA-Z0-9_-]+)/g;
  const mentions: string[] = [];
  let match;
  
  while ((match = mentionRegex.exec(text)) !== null) {
    const username = match[1];
    // Exclude common GitHub bots and the sender
    if (!isBot(username)) {
      mentions.push(username);
    }
  }
  
  return [...new Set(mentions)]; // Remove duplicates
}

/**
 * Check if a username is likely a bot
 */
function isBot(username: string): boolean {
  const botPatterns = [
    'dependabot',
    'github-actions',
    'renovate',
    'codecov',
    'greenkeeper',
    'snyk-bot'
  ];
  
  return botPatterns.some(pattern => username.toLowerCase().includes(pattern));
}

/**
 * Create mention data object
 */
async function createMentionData(
  baseInfo: any,
  mentionedGitHubUser: string,
  mentioner: string,
  fullText: string,
  db: D1Database,
  commentUrl?: string
): Promise<MentionAlertData | null> {
  try {
    // Skip self-mentions
    if (mentionedGitHubUser === mentioner) {
      return null;
    }

    // Get Telegram username mapping (fallback to GitHub username if no mapping)
    const telegramUser = notificationConfig.mentions[mentionedGitHubUser] || `@${mentionedGitHubUser}`;

    // Extract context around the mention
    const context = extractContext(fullText, mentionedGitHubUser);

    // Store mention in database
    await storeMention(
      db,
      baseInfo.number.toString(),
      mentionedGitHubUser,
      mentioner,
      context
    );

    return {
      ...baseInfo,
      mentionedUser: mentionedGitHubUser,
      mentionedTelegramUser: telegramUser,
      mentioner,
      context,
      commentUrl
    };
  } catch (error) {
    console.error('Error creating mention data:', error);
    return null;
  }
}

/**
 * Extract context around a mention
 */
function extractContext(text: string, mentionedUser: string): string {
  const mentionPattern = new RegExp(`@${mentionedUser}\\b`, 'i');
  const match = text.search(mentionPattern);
  
  if (match === -1) return text.substring(0, 100);
  
  // Extract 50 characters before and after the mention
  const start = Math.max(0, match - 50);
  const end = Math.min(text.length, match + mentionedUser.length + 50);
  
  let context = text.substring(start, end);
  
  // Add ellipsis if truncated
  if (start > 0) context = '...' + context;
  if (end < text.length) context = context + '...';
  
  return context.trim();
}

/**
 * Store mention in database
 */
async function storeMention(
  db: D1Database,
  githubId: string,
  mentionedUser: string,
  mentioner: string,
  context: string
): Promise<void> {
  try {
    await db
      .prepare(
        `INSERT OR IGNORE INTO github_mentions 
         (github_id, mentioned_user, mentioner, context, created_at)
         VALUES (?, ?, ?, ?, ?)`
      )
      .bind(
        githubId,
        mentionedUser,
        mentioner,
        context,
        new Date().toISOString()
      )
      .run();
  } catch (error) {
    console.error('Error storing mention in database:', error);
  }
}

/**
 * Format mention alert message
 */
export function formatMentionAlertMessage(data: MentionAlertData): string {
  let message = `📣 <b>${data.mentionedTelegramUser} was mentioned</b> in ${data.type} #${data.number}\n`;
  message += `🗂️ <b>Title:</b> ${data.title}\n`;
  message += `👤 <b>By:</b> @${data.mentioner}\n`;
  message += `🧾 <b>Context:</b> "${data.context}"\n`;
  message += `🎯 <b>Action needed!</b>\n`;
  
  if (data.commentUrl) {
    message += `💬 <a href="${data.commentUrl}">View Comment</a> | `;
  }
  
  message += `🔗 <a href="${data.url}">View ${data.type}</a>`;
  
  return message;
}

/**
 * Acknowledge a mention (mark as read)
 */
export async function acknowledgeMention(
  db: D1Database,
  githubId: string,
  mentionedUser: string
): Promise<boolean> {
  try {
    const result = await db
      .prepare(
        `UPDATE github_mentions 
         SET acknowledged = TRUE 
         WHERE github_id = ? AND mentioned_user = ? AND acknowledged = FALSE`
      )
      .bind(githubId, mentionedUser)
      .run();

    return result.success;
  } catch (error) {
    console.error('Error acknowledging mention:', error);
    return false;
  }
}

/**
 * Get unacknowledged mentions for a user
 */
export async function getUnacknowledgedMentions(
  db: D1Database,
  mentionedUser: string,
  limit: number = 10
): Promise<any[]> {
  try {
    const result = await db
      .prepare(
        `SELECT * FROM github_mentions 
         WHERE mentioned_user = ? AND acknowledged = FALSE 
         ORDER BY created_at DESC 
         LIMIT ?`
      )
      .bind(mentionedUser, limit)
      .all();

    return result.results || [];
  } catch (error) {
    console.error('Error getting unacknowledged mentions:', error);
    return [];
  }
}
