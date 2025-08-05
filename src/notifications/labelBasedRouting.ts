import { GitHubWebhookPayload } from '../types/github';
import { sendTelegramMessage } from '../utils/telegram-helpers';
import { notificationConfig } from '../config/notifications';

/**
 * Label-Based Routing - Route notifications based on labels to appropriate channels
 * Handles: Security alerts to private channels, UX alerts to design team, etc.
 */

export interface LabelRoutingRule {
  labels: string[];
  targetChannels: string[];
  template: string;
  priority: 'low' | 'normal' | 'high' | 'critical';
  conditions?: {
    eventTypes?: string[];
    authors?: string[];
    excludeLabels?: string[];
  };
}

export interface LabelRoutingData {
  id: number;
  number: number;
  title: string;
  author: string;
  url: string;
  type: 'PR' | 'Issue';
  repository: string;
  labels: string[];
  matchedRule: LabelRoutingRule;
  priority: 'low' | 'normal' | 'high' | 'critical';
}

// Define routing rules for different label types
export const labelRoutingRules: LabelRoutingRule[] = [
  // Security alerts - high priority notifications to dev channel
  {
    labels: ['security', 'vulnerability', 'critical', 'cve'],
    targetChannels: ['kc_dev'],
    template: 'security_alert',
    priority: 'critical',
    conditions: {
      eventTypes: ['pull_request.opened', 'issues.opened', 'pull_request.review_requested']
    }
  },
  
  // Design/UX alerts - route to design team
  {
    labels: ['ux', 'design', 'ui', 'frontend', 'styling'],
    targetChannels: ['kc_dev'],
    template: 'design_alert',
    priority: 'normal',
    conditions: {
      eventTypes: ['pull_request.opened', 'pull_request.review_requested']
    }
  },

  // Bug fixes - high priority
  {
    labels: ['bug', 'hotfix', 'urgent', 'production'],
    targetChannels: ['kc_dev'],
    template: 'bug_alert',
    priority: 'high',
    conditions: {
      eventTypes: ['pull_request.opened', 'issues.opened']
    }
  },

  // Performance issues
  {
    labels: ['performance', 'optimization', 'slow'],
    targetChannels: ['kc_dev'],
    template: 'performance_alert', 
    priority: 'normal',
    conditions: {
      eventTypes: ['pull_request.opened', 'issues.opened']
    }
  },

  // Documentation updates - lower priority
  {
    labels: ['documentation', 'docs', 'readme'],
    targetChannels: ['kc_dev'],
    template: 'docs_alert',
    priority: 'low',
    conditions: {
      eventTypes: ['pull_request.opened']
    }
  },

  // Dependencies and infrastructure
  {
    labels: ['dependencies', 'infrastructure', 'ci', 'devops'],
    targetChannels: ['kc_dev'],
    template: 'infrastructure_alert',
    priority: 'normal',
    conditions: {
      eventTypes: ['pull_request.opened', 'issues.opened']
    }
  }
];

/**
 * Process label-based routing for GitHub events
 *
 * @param db - D1Database instance
 * @param botToken - Telegram bot token
 * @param eventType - GitHub event type
 * @param payload - GitHub webhook payload
 */
export async function processLabelBasedRouting(
  db: D1Database,
  botToken: string,
  eventType: string,
  payload: GitHubWebhookPayload
): Promise<void> {
  try {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] Processing label-based routing for: ${eventType}`);

    const routingData = extractLabelRoutingData(payload, eventType);
    if (!routingData) {
      console.log(`[${timestamp}] No routing data extracted for: ${eventType}`);
      return;
    }

    // Find matching routing rules
    const matchingRules = findMatchingRoutingRules(routingData, eventType);
    if (matchingRules.length === 0) {
      console.log(`[${timestamp}] No matching routing rules for labels: ${routingData.labels.join(', ')}`);
      return;
    }

    // Process each matching rule
    for (const rule of matchingRules) {
      const routingDataWithRule = { ...routingData, matchedRule: rule, priority: rule.priority };
      await sendLabelBasedNotification(db, botToken, eventType, routingDataWithRule);
    }

    console.log(`[${timestamp}] Label-based routing processed successfully`);
  } catch (error) {
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}] Error processing label-based routing:`, error);
  }
}

/**
 * Extract label routing data from GitHub payload
 */
function extractLabelRoutingData(payload: GitHubWebhookPayload, eventType: string): LabelRoutingData | null {
  try {
    if ('pull_request' in payload) {
      const pr = payload.pull_request;
      return {
        id: pr.id,
        number: pr.number,
        title: pr.title,
        author: pr.user.login,
        url: pr.html_url,
        type: 'PR',
        repository: payload.repository.full_name,
        labels: pr.labels.map(l => l.name.toLowerCase()),
        matchedRule: labelRoutingRules[0], // Will be replaced
        priority: 'normal'
      };
    } else if ('issue' in payload) {
      const issue = payload.issue;
      return {
        id: issue.id,
        number: issue.number,
        title: issue.title,
        author: issue.user.login,
        url: issue.html_url,
        type: 'Issue',
        repository: payload.repository.full_name,
        labels: issue.labels.map(l => l.name.toLowerCase()),
        matchedRule: labelRoutingRules[0], // Will be replaced
        priority: 'normal'
      };
    }

    return null;
  } catch (error) {
    console.error('Error extracting label routing data:', error);
    return null;
  }
}

/**
 * Find matching routing rules based on labels and conditions
 */
function findMatchingRoutingRules(data: LabelRoutingData, eventType: string): LabelRoutingRule[] {
  const matchingRules: LabelRoutingRule[] = [];

  for (const rule of labelRoutingRules) {
    // Check if any of the rule's labels match the data's labels
    const hasMatchingLabel = rule.labels.some(ruleLabel => 
      data.labels.includes(ruleLabel.toLowerCase())
    );

    if (!hasMatchingLabel) continue;

    // Check event type conditions
    if (rule.conditions?.eventTypes && 
        !rule.conditions.eventTypes.includes(eventType)) {
      continue;
    }

    // Check author conditions
    if (rule.conditions?.authors && 
        !rule.conditions.authors.includes(data.author)) {
      continue;
    }

    // Check exclude labels
    if (rule.conditions?.excludeLabels) {
      const hasExcludedLabel = rule.conditions.excludeLabels.some(excludeLabel =>
        data.labels.includes(excludeLabel.toLowerCase())
      );
      if (hasExcludedLabel) continue;
    }

    matchingRules.push(rule);
  }

  // Sort by priority (critical > high > normal > low)
  const priorityOrder = { critical: 4, high: 3, normal: 2, low: 1 };
  return matchingRules.sort((a, b) => priorityOrder[b.priority] - priorityOrder[a.priority]);
}

/**
 * Send label-based notification
 */
async function sendLabelBasedNotification(
  db: D1Database,
  botToken: string,
  eventType: string,
  data: LabelRoutingData
): Promise<void> {
  try {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] Sending label-based notification for: ${data.matchedRule.template}`);

    // Generate message based on template
    const message = generateLabelBasedMessage(data);

    // Send to each target channel
    for (const channelKey of data.matchedRule.targetChannels) {
      const channelConfig = notificationConfig.channels[channelKey];
      if (!channelConfig?.chatId) {
        console.warn(`[${timestamp}] Channel config not found: ${channelKey}`);
        continue;
      }

      try {
        // Check for duplicates
        const dataHash = await generateNotificationHash(eventType, data, message);
        const existingNotification = await db
          .prepare(
            `SELECT id FROM github_notifications 
             WHERE event_type = ? AND github_id = ? AND notification_type = ? AND data_hash = ?`
          )
          .bind(eventType, data.id.toString(), data.matchedRule.template, dataHash)
          .first();

        if (existingNotification) {
          console.log(`[${timestamp}] Label-based notification already sent, skipping duplicate`);
          continue;
        }

        // Send the message
        const response = await sendTelegramMessage(
          botToken,
          channelConfig.chatId,
          message
        );

        if (response.ok) {
          // Record the notification
          await db
            .prepare(
              `INSERT INTO github_notifications 
               (event_type, github_id, notification_type, chat_id, sent_at, data_hash)
               VALUES (?, ?, ?, ?, ?, ?)`
            )
            .bind(
              eventType,
              data.id.toString(),
              data.matchedRule.template,
              channelConfig.chatId,
              timestamp,
              dataHash
            )
            .run();

          console.log(`[${timestamp}] Label-based notification sent to channel: ${channelKey}`);
        } else {
          console.error(`[${timestamp}] Failed to send label-based notification to: ${channelKey}`);
        }
      } catch (channelError) {
        console.error(`[${timestamp}] Error sending to channel ${channelKey}:`, channelError);
      }
    }
  } catch (error) {
    console.error('Error sending label-based notification:', error);
  }
}

/**
 * Generate message based on the matched template
 */
function generateLabelBasedMessage(data: LabelRoutingData): string {
  const { matchedRule, priority } = data;
  
  // Get priority emoji and text
  const priorityEmojis = {
    critical: '🚨',
    high: '⚠️',
    normal: '📋',
    low: '📝'
  };

  const priorityLabels = {
    critical: ' <b>(CRITICAL)</b>',
    high: ' <b>(HIGH PRIORITY)</b>',
    normal: '',
    low: ' <i>(Low Priority)</i>'
  };

  const emoji = priorityEmojis[priority];
  const priorityText = priorityLabels[priority];

  // Generate message based on template type
  switch (matchedRule.template) {
    case 'security_alert':
      return generateSecurityAlertMessage(data, emoji, priorityText);
    case 'design_alert':
      return generateDesignAlertMessage(data, emoji, priorityText);
    case 'bug_alert':
      return generateBugAlertMessage(data, emoji, priorityText);
    case 'performance_alert':
      return generatePerformanceAlertMessage(data, emoji, priorityText);
    case 'docs_alert':
      return generateDocsAlertMessage(data, emoji, priorityText);
    case 'infrastructure_alert':
      return generateInfrastructureAlertMessage(data, emoji, priorityText);
    default:
      return generateDefaultLabelMessage(data, emoji, priorityText);
  }
}

/**
 * Generate security alert message
 */
function generateSecurityAlertMessage(data: LabelRoutingData, emoji: string, priorityText: string): string {
  const securityLabels = data.labels.filter(label => 
    ['security', 'vulnerability', 'critical', 'cve'].includes(label)
  );

  return `${emoji} <b>Security Alert${priorityText}:</b> ${data.type} #${data.number}
🗂️ <b>Title:</b> ${data.title}
👤 <b>Author:</b> @${data.author}
🔒 <b>Security Labels:</b> ${securityLabels.join(', ')}
⚠️ <b>Immediate attention required!</b>
🔗 <a href="${data.url}">View ${data.type}</a>`;
}

/**
 * Generate design alert message
 */
function generateDesignAlertMessage(data: LabelRoutingData, emoji: string, priorityText: string): string {
  const designLabels = data.labels.filter(label => 
    ['ux', 'design', 'ui', 'frontend', 'styling'].includes(label)
  );

  return `🎨 <b>Design/UX Update${priorityText}:</b> ${data.type} #${data.number}
🗂️ <b>Title:</b> ${data.title}
👤 <b>Author:</b> @${data.author}
🏷️ <b>Design Labels:</b> ${designLabels.join(', ')}
👀 <b>Design team review needed</b>
🔗 <a href="${data.url}">View ${data.type}</a>`;
}

/**
 * Generate bug alert message
 */
function generateBugAlertMessage(data: LabelRoutingData, emoji: string, priorityText: string): string {
  return `${emoji} <b>Bug Report${priorityText}:</b> ${data.type} #${data.number}
🗂️ <b>Title:</b> ${data.title}
👤 <b>Author:</b> @${data.author}
🐛 <b>Type:</b> Bug Fix / Issue
🔥 <b>Needs prompt attention</b>
🔗 <a href="${data.url}">View ${data.type}</a>`;
}

/**
 * Generate performance alert message
 */
function generatePerformanceAlertMessage(data: LabelRoutingData, emoji: string, priorityText: string): string {
  return `⚡ <b>Performance Update${priorityText}:</b> ${data.type} #${data.number}
🗂️ <b>Title:</b> ${data.title}
👤 <b>Author:</b> @${data.author}
📊 <b>Type:</b> Performance / Optimization
🚀 <b>Speed improvements incoming!</b>
🔗 <a href="${data.url}">View ${data.type}</a>`;
}

/**
 * Generate docs alert message
 */
function generateDocsAlertMessage(data: LabelRoutingData, emoji: string, priorityText: string): string {
  return `📚 <b>Documentation Update${priorityText}:</b> ${data.type} #${data.number}
🗂️ <b>Title:</b> ${data.title}
👤 <b>Author:</b> @${data.author}
📖 <b>Type:</b> Documentation
✍️ <b>Knowledge base improvements</b>
🔗 <a href="${data.url}">View ${data.type}</a>`;
}

/**
 * Generate infrastructure alert message
 */
function generateInfrastructureAlertMessage(data: LabelRoutingData, emoji: string, priorityText: string): string {
  return `🔧 <b>Infrastructure Update${priorityText}:</b> ${data.type} #${data.number}
🗂️ <b>Title:</b> ${data.title}
👤 <b>Author:</b> @${data.author}
⚙️ <b>Type:</b> Infrastructure / DevOps
🏗️ <b>System improvements</b>
🔗 <a href="${data.url}">View ${data.type}</a>`;
}

/**
 * Generate default label message
 */
function generateDefaultLabelMessage(data: LabelRoutingData, emoji: string, priorityText: string): string {
  return `${emoji} <b>Labeled ${data.type}${priorityText}:</b> #${data.number}
🗂️ <b>Title:</b> ${data.title}
👤 <b>Author:</b> @${data.author}
🏷️ <b>Labels:</b> ${data.labels.join(', ')}
🔗 <a href="${data.url}">View ${data.type}</a>`;
}

/**
 * Generate notification hash for duplicate detection
 */
async function generateNotificationHash(eventType: string, data: any, message: string): Promise<string> {
  const hashInput = `${eventType}-${data.id}-${data.matchedRule?.template}-${message.length}`;
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(hashInput));
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16);
}
