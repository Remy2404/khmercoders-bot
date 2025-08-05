import { processActivityPulseReport, scheduleActivityPulseReports } from './activityPulseReport';
import { processReviewerPingSystem, scheduleReviewerPingChecks } from './reviewerPingSystem';
import { processLabelBasedRouting } from './labelBasedRouting';
import { processSmartAlert } from './smartAlert';
import { processMentionAlert } from './mentionsAlert';
import { GitHubWebhookPayload } from '../types/github';

/**
 * Notification Scheduler and Coordinator
 * Manages all notification systems and provides a unified interface
 */

export interface NotificationSchedulerConfig {
  enableSmartAlerts: boolean;
  enableMentionAlerts: boolean;
  enableActivityPulse: boolean;
  enableReviewerPings: boolean;
  enableLabelRouting: boolean;
  defaultChannels: string[];
}

export const defaultSchedulerConfig: NotificationSchedulerConfig = {
  enableSmartAlerts: true,
  enableMentionAlerts: true,
  enableActivityPulse: true,
  enableReviewerPings: true,
  enableLabelRouting: true,
  defaultChannels: ['kc_dev']
};

/**
 * Process all GitHub webhook notifications through the modular system
 *
 * @param db - D1Database instance
 * @param botToken - Telegram bot token
 * @param eventType - GitHub event type
 * @param payload - GitHub webhook payload
 * @param env - Environment variables
 * @param config - Scheduler configuration
 */
export async function processAllNotifications(
  db: D1Database,
  botToken: string,
  eventType: string,
  payload: GitHubWebhookPayload,
  env: CloudflareBindings,
  config: NotificationSchedulerConfig = defaultSchedulerConfig
): Promise<void> {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] Processing notifications for event: ${eventType}`);

  try {
    // Initialize promises array for parallel processing
    const notificationPromises: Promise<void>[] = [];

    // 1. Smart Alert Summary (handles all basic PR/Issue events)
    if (config.enableSmartAlerts && shouldProcessSmartAlert(eventType)) {
      console.log(`[${timestamp}] Scheduling smart alert processing`);
      notificationPromises.push(
        processSmartAlert(db, botToken, eventType, payload, config.defaultChannels, env)
          .catch(error => console.error(`Smart alert error: ${error}`))
      );
    }

    // 2. DevMentions Alert (handles @mentions in comments, descriptions)
    if (config.enableMentionAlerts && shouldProcessMentionAlert(eventType)) {
      console.log(`[${timestamp}] Scheduling mention alert processing`);
      notificationPromises.push(
        processMentionAlert(db, botToken, eventType, payload, config.defaultChannels)
          .catch(error => console.error(`Mention alert error: ${error}`))
      );
    }

    // 3. Label-Based Routing (routes based on labels to specific channels)
    if (config.enableLabelRouting && shouldProcessLabelRouting(eventType)) {
      console.log(`[${timestamp}] Scheduling label-based routing`);
      notificationPromises.push(
        processLabelBasedRouting(db, botToken, eventType, payload)
          .catch(error => console.error(`Label routing error: ${error}`))
      );
    }

    // Wait for all notifications to complete
    if (notificationPromises.length > 0) {
      await Promise.all(notificationPromises);
      console.log(`[${timestamp}] All notifications processed successfully`);
    } else {
      console.log(`[${timestamp}] No notifications scheduled for event: ${eventType}`);
    }

  } catch (error) {
    console.error(`[${timestamp}] Error in notification scheduler:`, error);
  }
}

/**
 * Run scheduled notification tasks (activity pulse, reviewer pings)
 * This should be called periodically (e.g., via cron job or scheduled workers)
 *
 * @param db - D1Database instance
 * @param botToken - Telegram bot token
 * @param env - Environment variables
 * @param config - Scheduler configuration
 */
export async function runScheduledNotifications(
  db: D1Database,
  botToken: string,
  env: CloudflareBindings,
  config: NotificationSchedulerConfig = defaultSchedulerConfig
): Promise<void> {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] Running scheduled notifications`);

  try {
    const scheduledPromises: Promise<void>[] = [];

    // 4. Activity Pulse Report (daily/weekly summaries)
    if (config.enableActivityPulse) {
      console.log(`[${timestamp}] Scheduling activity pulse reports`);
      scheduledPromises.push(
        scheduleActivityPulseReports(db, botToken, env)
          .catch(error => console.error(`Activity pulse error: ${error}`))
      );
    }

    // 5. Reviewer Ping System (check for stale PRs)
    if (config.enableReviewerPings) {
      console.log(`[${timestamp}] Scheduling reviewer ping checks`);
      scheduledPromises.push(
        scheduleReviewerPingChecks(db, botToken, env)
          .catch(error => console.error(`Reviewer ping error: ${error}`))
      );
    }

    // Wait for all scheduled tasks to complete
    if (scheduledPromises.length > 0) {
      await Promise.all(scheduledPromises);
      console.log(`[${timestamp}] All scheduled notifications completed`);
    } else {
      console.log(`[${timestamp}] No scheduled notifications enabled`);
    }

  } catch (error) {
    console.error(`[${timestamp}] Error in scheduled notifications:`, error);
  }
}

/**
 * Manual trigger for specific notification types
 */
export async function manualTriggerNotification(
  type: 'activity_pulse' | 'reviewer_ping',
  period: 'hourly' | 'daily' | 'weekly',
  db: D1Database,
  botToken: string,
  env: CloudflareBindings,
  channels: string[] = ['kc_dev']
): Promise<void> {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] Manually triggering ${type} notification`);

  try {
    switch (type) {
      case 'activity_pulse':
        await processActivityPulseReport(db, botToken, period as any, channels);
        break;
      case 'reviewer_ping':
        await processReviewerPingSystem(db, botToken, channels);
        break;
      default:
        console.warn(`[${timestamp}] Unknown notification type: ${type}`);
    }
  } catch (error) {
    console.error(`[${timestamp}] Error in manual trigger:`, error);
  }
}

/**
 * Check if event should trigger smart alert
 */
function shouldProcessSmartAlert(eventType: string): boolean {
  const smartAlertEvents = [
    'pull_request.opened',
    'pull_request.closed', 
    'pull_request.merged',
    'issues.opened',
    'issues.closed',
    'push'  // Add push events for commit notifications
  ];
  return smartAlertEvents.includes(eventType);
}/**
 * Check if event should trigger mention alert
 */
function shouldProcessMentionAlert(eventType: string): boolean {
  const mentionAlertEvents = [
    'issue_comment.created',
    'pull_request_review.submitted',
    'pull_request_review_comment.created',
    'pull_request.opened',
    'issues.opened'
  ];
  return mentionAlertEvents.includes(eventType);
}

/**
 * Check if event should trigger label-based routing
 */
function shouldProcessLabelRouting(eventType: string): boolean {
  const labelRoutingEvents = [
    'pull_request.opened',
    'pull_request.reopened',
    'pull_request.labeled',
    'issues.opened',
    'issues.reopened',
    'issues.labeled'
  ];
  return labelRoutingEvents.includes(eventType);
}

/**
 * Get notification system status
 */
export async function getNotificationSystemStatus(
  db: D1Database
): Promise<{
  totalNotificationsSent: number;
  notificationsByType: Record<string, number>;
  recentActivity: any[];
  systemHealth: 'healthy' | 'warning' | 'error';
}> {
  try {
    // Get total notifications sent
    const totalResult = await db
      .prepare(`SELECT COUNT(*) as total FROM github_notifications`)
      .first();

    // Get notifications by type
    const typeResults = await db
      .prepare(`
        SELECT notification_type, COUNT(*) as count 
        FROM github_notifications 
        GROUP BY notification_type 
        ORDER BY count DESC
      `)
      .all();

    // Get recent activity (last 24 hours)
    const recentActivity = await db
      .prepare(`
        SELECT event_type, notification_type, sent_at 
        FROM github_notifications 
        WHERE sent_at >= datetime('now', '-24 hours')
        ORDER BY sent_at DESC
        LIMIT 10
      `)
      .all();

    const total = (totalResult as any)?.total || 0;
    const notificationsByType: Record<string, number> = {};
    
    if (typeResults.results) {
      for (const result of typeResults.results as any[]) {
        notificationsByType[result.notification_type] = result.count;
      }
    }

    // Determine system health
    let systemHealth: 'healthy' | 'warning' | 'error' = 'healthy';
    if (total === 0) {
      systemHealth = 'warning';
    }

    return {
      totalNotificationsSent: total,
      notificationsByType,
      recentActivity: recentActivity.results || [],
      systemHealth
    };
  } catch (error) {
    console.error('Error getting notification system status:', error);
    return {
      totalNotificationsSent: 0,
      notificationsByType: {},
      recentActivity: [],
      systemHealth: 'error'
    };
  }
}
