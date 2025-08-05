import { GitHubWebhookPayload } from '../types/github';
import { sendTelegramMessage } from '../utils/telegram-helpers';
import { notificationConfig } from '../config/notifications';

/**
 * Reviewer Ping System - Monitor stale PRs and ping reviewers
 * Handles: Automatic reminders for PRs awaiting review, escalation system
 */

export interface ReviewerPingData {
  pr: {
    number: number;
    title: string;
    author: string;
    url: string;
    repository: string;
    createdAt: string;
    updatedAt: string;
  };
  reviewers: Array<{
    githubUsername: string;
    telegramUsername?: string;
    requestedAt: string;
  }>;
  waitingTime: number; // hours
  urgencyLevel: 'normal' | 'urgent' | 'critical';
  previousPings: number;
}

/**
 * Process reviewer ping system - check for stale PRs
 *
 * @param db - D1Database instance
 * @param botToken - Telegram bot token
 * @param targetChannels - Array of channel keys to send to
 */
export async function processReviewerPingSystem(
  db: D1Database,
  botToken: string,
  targetChannels: string[] = ['kc_dev']
): Promise<void> {
  try {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] Processing reviewer ping system`);

    // Find PRs waiting for review
    const stalePRs = await findStalePRs(db);
    
    if (stalePRs.length === 0) {
      console.log(`[${timestamp}] No stale PRs found`);
      return;
    }

    console.log(`[${timestamp}] Found ${stalePRs.length} stale PRs for reviewer pings`);

    // Process each stale PR
    for (const prData of stalePRs) {
      await sendReviewerPing(db, botToken, prData, targetChannels);
    }

    console.log(`[${timestamp}] Reviewer ping system processed successfully`);
  } catch (error) {
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}] Error processing reviewer ping system:`, error);
  }
}

/**
 * Process new review requests from GitHub webhooks
 *
 * @param db - D1Database instance
 * @param botToken - Telegram bot token
 * @param payload - GitHub webhook payload
 * @param targetChannels - Array of channel keys to send to
 */
export async function processReviewRequest(
  db: D1Database,
  botToken: string,
  payload: GitHubWebhookPayload,
  targetChannels: string[]
): Promise<void> {
  try {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] Processing review request`);

    if (!('pull_request' in payload) || !('requested_reviewer' in payload)) {
      console.log(`[${timestamp}] Not a valid review request payload`);
      return;
    }

    const pr = payload.pull_request;
    const reviewer = payload.requested_reviewer;

    if (!reviewer) {
      console.log(`[${timestamp}] No reviewer found in payload`);
      return;
    }

    // Update PR tracking with reviewer information
    await updatePRWithReviewer(db, pr, reviewer);

    // Send immediate notification
    const reviewData: ReviewerPingData = {
      pr: {
        number: pr.number,
        title: pr.title,
        author: pr.user.login,
        url: pr.html_url,
        repository: payload.repository.full_name,
        createdAt: pr.created_at,
        updatedAt: pr.updated_at
      },
      reviewers: [{
        githubUsername: reviewer.login,
        telegramUsername: notificationConfig.mentions[reviewer.login],
        requestedAt: new Date().toISOString()
      }],
      waitingTime: 0,
      urgencyLevel: 'normal',
      previousPings: 0
    };

    const message = generateReviewRequestMessage(reviewData);
    await sendToChannels(botToken, message, targetChannels);

    console.log(`[${timestamp}] Review request processed for PR #${pr.number}`);
  } catch (error) {
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}] Error processing review request:`, error);
  }
}

/**
 * Find PRs that are waiting for review for too long
 */
async function findStalePRs(db: D1Database): Promise<ReviewerPingData[]> {
  try {
    const now = new Date();
    const stalePRs: ReviewerPingData[] = [];

    // Find PRs that have been open and awaiting review
    const prs = await db
      .prepare(
        `SELECT pr_number, repository, author, title, created_at, updated_at, 
                reviewers, last_activity_at, review_requested_at
         FROM github_pr_tracking 
         WHERE state = 'open' 
         AND reviewers IS NOT NULL 
         AND review_requested_at IS NOT NULL
         ORDER BY review_requested_at ASC`
      )
      .all();

    if (!prs.results || prs.results.length === 0) {
      return [];
    }

    for (const pr of prs.results) {
      const prData = pr as any;
      const reviewRequestedAt = new Date(prData.review_requested_at);
      const waitingTimeMs = now.getTime() - reviewRequestedAt.getTime();
      const waitingTimeHours = Math.floor(waitingTimeMs / (1000 * 60 * 60));

      // Check if PR needs a ping based on waiting time
      if (shouldSendReviewerPing(waitingTimeHours)) {
        // Parse reviewers from JSON
        let reviewers: any[] = [];
        try {
          reviewers = JSON.parse(prData.reviewers || '[]');
        } catch (e) {
          console.warn(`Failed to parse reviewers for PR #${prData.pr_number}`);
          continue;
        }

        // Count previous pings
        const previousPings = await countPreviousReviewerPings(db, prData.pr_number);

        const urgencyLevel = determineUrgencyLevel(waitingTimeHours, previousPings);

        stalePRs.push({
          pr: {
            number: prData.pr_number,
            title: prData.title,
            author: prData.author,
            url: `https://github.com/${prData.repository}/pull/${prData.pr_number}`,
            repository: prData.repository,
            createdAt: prData.created_at,
            updatedAt: prData.updated_at
          },
          reviewers: reviewers.map(reviewer => ({
            githubUsername: reviewer,
            telegramUsername: notificationConfig.mentions[reviewer],
            requestedAt: prData.review_requested_at
          })),
          waitingTime: waitingTimeHours,
          urgencyLevel,
          previousPings
        });
      }
    }

    return stalePRs;
  } catch (error) {
    console.error('Error finding stale PRs:', error);
    return [];
  }
}

/**
 * Determine if a reviewer ping should be sent based on waiting time
 */
function shouldSendReviewerPing(waitingTimeHours: number): boolean {
  // Send pings at these intervals:
  // 36 hours (initial ping)
  // 72 hours (second ping)
  // 120 hours (5 days - urgent)
  // 168 hours (7 days - critical)
  
  const pingIntervals = [36, 72, 120, 168];
  
  return pingIntervals.some(interval => 
    waitingTimeHours >= interval && waitingTimeHours < interval + 24
  );
}

/**
 * Determine urgency level based on waiting time and previous pings
 */
function determineUrgencyLevel(waitingTimeHours: number, previousPings: number): 'normal' | 'urgent' | 'critical' {
  if (waitingTimeHours >= 168 || previousPings >= 3) { // 7 days or 3+ pings
    return 'critical';
  } else if (waitingTimeHours >= 120 || previousPings >= 2) { // 5 days or 2+ pings
    return 'urgent';
  } else {
    return 'normal';
  }
}

/**
 * Count previous reviewer pings for a PR
 */
async function countPreviousReviewerPings(db: D1Database, prNumber: number): Promise<number> {
  try {
    const result = await db
      .prepare(
        `SELECT COUNT(*) as count 
         FROM github_notifications 
         WHERE github_id = ? AND notification_type = 'reviewer_ping'`
      )
      .bind(prNumber.toString())
      .first();

    return (result as any)?.count || 0;
  } catch (error) {
    console.error('Error counting previous pings:', error);
    return 0;
  }
}

/**
 * Send reviewer ping notification
 */
async function sendReviewerPing(
  db: D1Database,
  botToken: string,
  prData: ReviewerPingData,
  targetChannels: string[]
): Promise<void> {
  try {
    const message = generateReviewerPingMessage(prData);
    await sendToChannels(botToken, message, targetChannels);

    // Record the ping in the database
    await db
      .prepare(
        `INSERT INTO github_notifications 
         (event_type, github_id, notification_type, chat_id, sent_at, data_hash)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .bind(
        'pull_request.review_ping',
        prData.pr.number.toString(),
        'reviewer_ping',
        notificationConfig.channels.kc_dev.chatId,
        new Date().toISOString(),
        `ping_${prData.pr.number}_${Date.now()}`
      )
      .run();

  } catch (error) {
    console.error('Error sending reviewer ping:', error);
  }
}

/**
 * Generate reviewer ping message
 */
function generateReviewerPingMessage(data: ReviewerPingData): string {
  const { pr, reviewers, waitingTime, urgencyLevel, previousPings } = data;
  
  let emoji = '👀';
  let urgencyText = '';
  
  switch (urgencyLevel) {
    case 'urgent':
      emoji = '⚠️';
      urgencyText = ' <b>(URGENT)</b>';
      break;
    case 'critical':
      emoji = '🚨';
      urgencyText = ' <b>(CRITICAL)</b>';
      break;
  }

  let message = `${emoji} <b>Review Needed${urgencyText}:</b> PR #${pr.number}\n`;
  message += `🗂️ <b>Title:</b> ${pr.title}\n`;
  message += `👤 <b>Author:</b> @${pr.author}\n`;
  message += `⏰ <b>Waiting for:</b> ${waitingTime} hours\n`;

  // Add reviewer mentions
  const reviewerMentions = reviewers
    .map(r => r.telegramUsername || `@${r.githubUsername}`)
    .join(', ');
  
  message += `👀 <b>Reviewers:</b> ${reviewerMentions}\n`;

  if (previousPings > 0) {
    message += `📢 <b>Previous pings:</b> ${previousPings}\n`;
  }

  message += `\n📎 <b>Let's unblock it!</b>\n`;
  message += `🔗 <a href="${pr.url}">Review Now</a>`;

  return message;
}

/**
 * Generate review request message (for immediate notifications)
 */
function generateReviewRequestMessage(data: ReviewerPingData): string {
  const { pr, reviewers } = data;
  const reviewer = reviewers[0]; // New request has only one reviewer

  let message = `👀 <b>Review Requested:</b> PR #${pr.number}\n`;
  message += `🗂️ <b>Title:</b> ${pr.title}\n`;
  message += `👤 <b>Author:</b> @${pr.author}\n`;
  message += `🎯 <b>Reviewer:</b> ${reviewer.telegramUsername || `@${reviewer.githubUsername}`}\n`;
  message += `🔗 <a href="${pr.url}">Review Now</a>`;

  return message;
}

/**
 * Update PR tracking with reviewer information
 */
async function updatePRWithReviewer(
  db: D1Database,
  pr: any,
  reviewer: any
): Promise<void> {
  try {
    // Get existing reviewers
    const existingPR = await db
      .prepare(`SELECT reviewers FROM github_pr_tracking WHERE pr_number = ?`)
      .bind(pr.number)
      .first();

    let reviewers: string[] = [];
    if (existingPR && (existingPR as any).reviewers) {
      try {
        reviewers = JSON.parse((existingPR as any).reviewers);
      } catch (e) {
        reviewers = [];
      }
    }

    // Add new reviewer if not already present
    if (!reviewers.includes(reviewer.login)) {
      reviewers.push(reviewer.login);
    }

    // Update PR with reviewer info
    await db
      .prepare(
        `UPDATE github_pr_tracking 
         SET reviewers = ?, review_requested_at = ?, updated_at = ?
         WHERE pr_number = ?`
      )
      .bind(
        JSON.stringify(reviewers),
        new Date().toISOString(),
        pr.updated_at,
        pr.number
      )
      .run();

  } catch (error) {
    console.error('Error updating PR with reviewer:', error);
  }
}

/**
 * Send message to multiple channels
 */
async function sendToChannels(
  botToken: string,
  message: string,
  channels: string[]
): Promise<void> {
  for (const channelKey of channels) {
    const channelConfig = notificationConfig.channels[channelKey];
    if (!channelConfig?.chatId) {
      console.warn(`Channel config not found: ${channelKey}`);
      continue;
    }

    try {
      await sendTelegramMessage(botToken, channelConfig.chatId, message);
    } catch (error) {
      console.error(`Error sending to channel ${channelKey}:`, error);
    }
  }
}

/**
 * Schedule reviewer ping checks (to be called from a cron job)
 */
export async function scheduleReviewerPingChecks(
  db: D1Database,
  botToken: string,
  env: CloudflareBindings
): Promise<void> {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] Running scheduled reviewer ping checks`);

  try {
    // Set up channel configuration
    notificationConfig.channels.kc_dev.chatId = env.KC_DEV_CHAT_ID || '';

    // Run every 6 hours during business hours (6 AM, 12 PM, 6 PM)
    const currentHour = new Date().getHours();
    if ([6, 12, 18].includes(currentHour)) {
      await processReviewerPingSystem(db, botToken, ['kc_dev']);
    }
  } catch (error) {
    console.error(`[${timestamp}] Error in scheduled reviewer ping checks:`, error);
  }
}
