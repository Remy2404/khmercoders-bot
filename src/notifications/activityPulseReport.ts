import { GitHubWebhookPayload } from '../types/github';
import { sendTelegramMessage } from '../utils/telegram-helpers';
import { notificationConfig } from '../config/notifications';

/**
 * Activity Pulse Report - Grouped alerts summarizing activity over time periods
 * Handles: Hourly/daily summaries of PR/Issue activity with contributor highlights
 */

export interface ActivityPulseData {
  period: 'hourly' | 'daily' | 'weekly';
  startDate: string;
  endDate: string;
  prsOpened: number;
  prsMerged: number;
  prsClosed: number;
  issuesOpened: number;
  issuesClosed: number;
  totalContributors: number;
  topContributors: Array<{
    username: string;
    contributions: number;
    type: 'pr' | 'issue' | 'review';
  }>;
  highlights: Array<{
    type: 'pr' | 'issue';
    number: number;
    title: string;
    author: string;
    url: string;
  }>;
}

/**
 * Process activity pulse reports on a scheduled basis
 *
 * @param db - D1Database instance
 * @param botToken - Telegram bot token
 * @param period - Time period for the report
 * @param targetChannels - Array of channel keys to send to
 */
export async function processActivityPulseReport(
  db: D1Database,
  botToken: string,
  period: 'hourly' | 'daily' | 'weekly' = 'daily',
  targetChannels: string[] = ['kc_dev']
): Promise<void> {
  try {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] Processing activity pulse report for: ${period}`);

    // Calculate date range based on period
    const { startDate, endDate } = getDateRange(period);
    
    // Check if we've already sent a report for this period
    const existingReport = await db
      .prepare(
        `SELECT id FROM activity_pulse 
         WHERE date = ? AND period_type = ? AND last_sent_at IS NOT NULL`
      )
      .bind(endDate.split('T')[0], period)
      .first();

    if (existingReport) {
      console.log(`[${timestamp}] Activity pulse report already sent for ${period} period ${endDate}`);
      return;
    }

    // Gather activity data
    const activityData = await gatherActivityData(db, startDate, endDate);
    
    // Skip if no activity
    if (activityData.prsOpened === 0 && activityData.issuesOpened === 0 && 
        activityData.prsMerged === 0 && activityData.issuesClosed === 0) {
      console.log(`[${timestamp}] No activity to report for ${period} period`);
      return;
    }

    // Generate the message
    const message = generateActivityPulseMessage(activityData, period);

    // Send to target channels
    for (const channelKey of targetChannels) {
      const channelConfig = notificationConfig.channels[channelKey];
      if (!channelConfig?.chatId) {
        console.warn(`[${timestamp}] Channel config not found: ${channelKey}`);
        continue;
      }

      try {
        const response = await sendTelegramMessage(
          botToken,
          channelConfig.chatId,
          message
        );

        if (response.ok) {
          console.log(`[${timestamp}] Activity pulse report sent to channel: ${channelKey}`);
        } else {
          console.error(`[${timestamp}] Failed to send pulse report to: ${channelKey}`);
        }
      } catch (error) {
        console.error(`[${timestamp}] Error sending pulse report to ${channelKey}:`, error);
      }
    }

    // Record the report in database
    await recordActivityPulse(db, activityData, period, endDate);

    console.log(`[${timestamp}] Activity pulse report processed successfully`);
  } catch (error) {
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}] Error processing activity pulse report:`, error);
  }
}

/**
 * Gather activity data from the database for the specified period
 */
async function gatherActivityData(
  db: D1Database, 
  startDate: string, 
  endDate: string
): Promise<ActivityPulseData> {
  try {
    // Get PR activity
    const prActivity = await db
      .prepare(
        `SELECT 
           COUNT(CASE WHEN state = 'open' THEN 1 END) as prs_opened,
           COUNT(CASE WHEN state = 'merged' THEN 1 END) as prs_merged,
           COUNT(CASE WHEN state = 'closed' AND state != 'merged' THEN 1 END) as prs_closed
         FROM github_pr_tracking 
         WHERE created_at >= ? AND created_at <= ?`
      )
      .bind(startDate, endDate)
      .first();

    // Get top contributors from notifications
    const contributors = await db
      .prepare(
        `SELECT event_type, COUNT(*) as count
         FROM github_notifications 
         WHERE sent_at >= ? AND sent_at <= ?
         GROUP BY event_type
         ORDER BY count DESC`
      )
      .bind(startDate, endDate)
      .all();

    // Get recent highlights
    const highlights = await db
      .prepare(
        `SELECT pr_number, title, author, repository
         FROM github_pr_tracking 
         WHERE created_at >= ? AND created_at <= ?
         AND state IN ('open', 'merged')
         ORDER BY created_at DESC
         LIMIT 3`
      )
      .bind(startDate, endDate)
      .all();

    const prActivityData = prActivity as any;
    const contributorsData = contributors as any;
    const highlightsData = highlights as any;

    return {
      period: 'daily', // Will be overridden by caller
      startDate,
      endDate,
      prsOpened: prActivityData?.prs_opened || 0,
      prsMerged: prActivityData?.prs_merged || 0,
      prsClosed: prActivityData?.prs_closed || 0,
      issuesOpened: 0, // TODO: Add issue tracking
      issuesClosed: 0, // TODO: Add issue tracking
      totalContributors: contributorsData?.results?.length || 0,
      topContributors: [], // TODO: Parse contributor data
      highlights: highlightsData?.results?.map((h: any) => ({
        type: 'pr' as const,
        number: h.pr_number,
        title: h.title,
        author: h.author,
        url: `https://github.com/${h.repository}/pull/${h.pr_number}`
      })) || []
    };
  } catch (error) {
    console.error('Error gathering activity data:', error);
    throw error;
  }
}

/**
 * Generate the activity pulse message
 */
function generateActivityPulseMessage(data: ActivityPulseData, period: string): string {
  const totalActivity = data.prsOpened + data.prsMerged + data.issuesOpened + data.issuesClosed;
  const periodLabel = period === 'hourly' ? 'Last Hour' : 
                     period === 'daily' ? 'Last 24h' : 'Last Week';

  let message = `🧪 <b>GitHub Pulse — ${periodLabel}</b>\n\n`;

  // Activity summary
  if (totalActivity > 0) {
    const activityItems = [];
    if (data.prsOpened > 0) activityItems.push(`${data.prsOpened} New PRs`);
    if (data.prsMerged > 0) activityItems.push(`${data.prsMerged} Merged`);
    if (data.issuesOpened > 0) activityItems.push(`${data.issuesOpened} New Issues`);
    if (data.issuesClosed > 0) activityItems.push(`${data.issuesClosed} Issues Closed`);
    
    message += `📌 ${activityItems.join(' • ')}\n`;
    
    if (data.totalContributors > 0) {
      message += `👥 <b>Contributors:</b> ${data.totalContributors} active\n`;
    }
  } else {
    message += `📊 <i>Quiet period - no major activity</i>\n`;
  }

  // Highlights
  if (data.highlights.length > 0) {
    message += `\n🔥 <b>Highlights:</b>\n`;
    data.highlights.forEach(highlight => {
      const emoji = highlight.type === 'pr' ? '🔀' : '📋';
      message += `${emoji} <a href="${highlight.url}">#${highlight.number}</a> by @${highlight.author}\n`;
    });
  }

  message += `\n<i>Updated: ${new Date().toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })}</i>`;

  return message;
}

/**
 * Get date range for the specified period
 */
function getDateRange(period: 'hourly' | 'daily' | 'weekly'): { startDate: string; endDate: string } {
  const endDate = new Date();
  const startDate = new Date();

  switch (period) {
    case 'hourly':
      startDate.setHours(endDate.getHours() - 1);
      break;
    case 'daily':
      startDate.setDate(endDate.getDate() - 1);
      break;
    case 'weekly':
      startDate.setDate(endDate.getDate() - 7);
      break;
  }

  return {
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString()
  };
}

/**
 * Record the activity pulse in the database
 */
async function recordActivityPulse(
  db: D1Database,
  data: ActivityPulseData,
  period: string,
  dateKey: string
): Promise<void> {
  try {
    await db
      .prepare(
        `INSERT OR REPLACE INTO activity_pulse 
         (date, period_type, prs_opened, prs_merged, prs_closed, 
          issues_opened, issues_closed, total_contributors, last_sent_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        dateKey.split('T')[0], // Date only
        period,
        data.prsOpened,
        data.prsMerged,
        data.prsClosed,
        data.issuesOpened,
        data.issuesClosed,
        data.totalContributors,
        new Date().toISOString()
      )
      .run();
  } catch (error) {
    console.error('Error recording activity pulse:', error);
    throw error;
  }
}

/**
 * Schedule activity pulse reports (to be called from a cron job or similar)
 */
export async function scheduleActivityPulseReports(
  db: D1Database,
  botToken: string,
  env: CloudflareBindings
): Promise<void> {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] Running scheduled activity pulse reports`);

  try {
    // Set up channel configuration
    notificationConfig.channels.kc_dev.chatId = env.KC_DEV_CHAT_ID || '';

    // Run daily report (every 24 hours)
    const currentHour = new Date().getHours();
    if (currentHour === 9) { // 9 AM daily report
      await processActivityPulseReport(db, botToken, 'daily', ['kc_dev']);
    }

    // Run weekly report (every Sunday at 10 AM)
    const currentDay = new Date().getDay();
    if (currentDay === 0 && currentHour === 10) { // Sunday 10 AM
      await processActivityPulseReport(db, botToken, 'weekly', ['kc_dev']);
    }
  } catch (error) {
    console.error(`[${timestamp}] Error in scheduled activity pulse reports:`, error);
  }
}
