import { GitHubWebhookPayload } from '../types/github';
import { sendGitHubNotification } from '../utils/notification-helpers';

/**
 * Smart Alert Summary - Clean, readable notifications for PR/Issue events
 * Handles: PR opened, closed, merged, Issue opened, closed
 */

export interface SmartAlertData {
  id: number;
  number: number;
  title: string;
  author: string;
  url: string;
  summary?: string;
  status: string;
  labels?: string[];
  type: 'PR' | 'Issue' | 'Push';
  merged?: boolean;
  repository: string;
  branch?: string;
  assignees?: string[];
  milestone?: string;
  linkedIssues?: number[];
}

/**
 * Process smart alert for PR/Issue events
 *
 * @param db - D1Database instance
 * @param botToken - Telegram bot token
 * @param eventType - GitHub event type
 * @param payload - GitHub webhook payload
 * @param targetChannels - Array of channel keys to send to
 * @param env - Environment variables
 */
export async function processSmartAlert(
  db: D1Database,
  botToken: string,
  eventType: string,
  payload: GitHubWebhookPayload,
  targetChannels: string[],
  env?: CloudflareBindings
): Promise<void> {
  try {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] Processing smart alert for: ${eventType}`);

    // Initialize configuration with environment variables
    if (env) {
      const { initializeNotificationConfig } = await import('../config/notifications');
      initializeNotificationConfig(env);
      console.log(`[${timestamp}] Initialized notification config with chat ID: ${env.KC_DEV_CHAT_ID}`);
    }

    const alertData = prepareSmartAlertData(payload, eventType);
    if (!alertData) {
      console.log(`[${timestamp}] No alert data prepared for: ${eventType}`);
      return;
    }

    console.log(`[${timestamp}] Alert data prepared:`, JSON.stringify(alertData, null, 2));

    // Send notification using the generic notification system
    await sendGitHubNotification(
      db,
      botToken,
      eventType,
      alertData,
      'smart_alert',
      targetChannels,
      env
    );

    console.log(`[${timestamp}] Smart alert processed successfully`);
  } catch (error) {
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}] Error processing smart alert:`, error);
  }
}

/**
 * Prepare data for smart alert notifications
 */
function prepareSmartAlertData(payload: GitHubWebhookPayload, eventType: string): SmartAlertData | null {
  if ('pull_request' in payload) {
    const pr = payload.pull_request;
    return {
      id: pr.id,
      number: pr.number,
      title: pr.title,
      author: pr.user.login,
      url: pr.html_url,
      summary: summarizeContent(pr.body),
      status: determineStatus(pr, eventType),
      labels: pr.labels.map(l => l.name),
      type: 'PR',
      merged: pr.merged,
      repository: payload.repository.full_name,
      branch: pr.head.ref
    };
  } else if ('issue' in payload) {
    const issue = payload.issue;
    return {
      id: issue.id,
      number: issue.number,
      title: issue.title,
      author: issue.user.login,
      url: issue.html_url,
      summary: summarizeContent(issue.body),
      status: determineIssueStatus(issue, eventType),
      labels: issue.labels.map(l => l.name),
      type: 'Issue',
      repository: payload.repository.full_name
    };
  } else if ('commits' in payload && eventType === 'push') {
    // Handle push events
    const branch = payload.ref.replace('refs/heads/', '');
    const commitCount = payload.commits.length;
    const headCommit = payload.head_commit;
    
    if (!headCommit) {
      // This is likely a branch deletion
      return null;
    }

    // Skip merge commits if you only want regular commits
    if (headCommit.message.startsWith('Merge pull request')) {
      console.log(`Skipping merge commit notification: ${headCommit.message}`);
      return null;
    }

    return {
      id: Date.now(), // Use timestamp as ID for push events
      number: 0, // Push events don't have numbers
      title: headCommit.message.split('\n')[0], // First line of commit message
      author: payload.sender.login,
      url: headCommit.url,
      summary: commitCount > 1 ? `${commitCount} commits pushed` : headCommit.message,
      status: payload.forced ? 'Force Pushed' : 'Pushed',
      labels: [],
      type: 'Push' as any,
      repository: payload.repository.full_name,
      branch: branch
    };
  }

  return null;
}

/**
 * Summarize long content for notifications
 */
function summarizeContent(content?: string): string {
  if (!content) return 'No description provided';
  
  // Remove markdown formatting and limit length
  const cleaned = content
    .replace(/[#*`_~]/g, '') // Remove markdown characters
    .replace(/\n+/g, ' ')    // Replace newlines with spaces
    .trim();
  
  if (cleaned.length <= 150) return cleaned;
  
  // Find a good breaking point near 150 characters
  const breakPoint = cleaned.lastIndexOf(' ', 150);
  return cleaned.substring(0, breakPoint > 100 ? breakPoint : 150) + '...';
}

/**
 * Determine PR status based on event and PR state
 */
function determineStatus(pr: any, eventType: string): string {
  if (eventType.includes('closed')) {
    return pr.merged ? 'Merged Successfully' : 'Closed Without Merging';
  }
  
  if (pr.draft) return 'Draft - Work in Progress';
  if (pr.requested_reviewers?.length > 0) return 'Awaiting Review';
  
  return 'Ready for Review';
}

/**
 * Determine issue status based on event and issue state
 */
function determineIssueStatus(issue: any, eventType: string): string {
  if (eventType.includes('closed')) {
    return 'Resolved';
  }
  
  if (issue.assignees?.length > 0) {
    return `Assigned to ${issue.assignees.map((a: any) => a.login).join(', ')}`;
  }
  
  return 'Open - Needs Assignment';
}

/**
 * Format smart alert message (this could be moved to templates if needed)
 */
export function formatSmartAlertMessage(data: SmartAlertData, eventType: string): string {
  const emoji = getEventEmoji(eventType, data);
  const action = getEventAction(eventType, data);
  
  // Handle push events differently
  if (data.type === 'Push') {
    let message = `${emoji} <b>${action}:</b> ${data.branch} by @${data.author}\n`;
    message += `📝 <b>Commit:</b> ${data.title}\n`;
    message += `📂 <b>Repository:</b> ${data.repository}\n`;
    message += `${data.status === 'Force Pushed' ? '⚠️ <b>Force pushed!</b>' : '✅ <b>Pushed successfully</b>'}\n`;
    message += `🔗 <a href="${data.url}">View Commit</a>`;
    return message;
  }
  
  // Handle PR/Issue events
  let message = `${emoji} <b>${action}:</b> #${data.number} by @${data.author}\n`;
  message += `🗂️ <b>Title:</b> ${data.title}\n`;
  message += `📋 <b>Summary:</b> ${data.summary}\n`;
  
  if (data.labels && data.labels.length > 0) {
    message += `🏷️ <b>Labels:</b> ${data.labels.join(', ')}\n`;
  }
  
  if (data.branch && data.type === 'PR') {
    message += `🌿 <b>Branch:</b> ${data.branch}\n`;
  }
  
  message += `⏳ <b>Status:</b> ${data.status}\n`;
  message += `🔗 <a href="${data.url}">View ${data.type}</a>`;
  
  return message;
}

/**
 * Get appropriate emoji for event type
 */
function getEventEmoji(eventType: string, data: SmartAlertData): string {
  if (eventType.includes('pull_request.opened')) return '🧩';
  if (eventType.includes('pull_request.closed')) {
    return data.merged ? '✅' : '❌';
  }
  if (eventType.includes('issues.opened')) return '🐛';
  if (eventType.includes('issues.closed')) return '✅';
  if (eventType === 'push') return '🚀';
  
  return '📝';
}

/**
 * Get action description for event type
 */
function getEventAction(eventType: string, data: SmartAlertData): string {
  if (eventType.includes('pull_request.opened')) return 'New PR Opened';
  if (eventType.includes('pull_request.closed')) {
    return data.merged ? 'PR Merged' : 'PR Closed';
  }
  if (eventType.includes('issues.opened')) return 'New Issue Opened';
  if (eventType.includes('issues.closed')) return 'Issue Closed';
  if (eventType === 'push') return 'New Commits';
  
  return 'Update';
}
