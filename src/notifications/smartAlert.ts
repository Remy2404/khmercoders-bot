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
  type: 'PR' | 'Issue';
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
 */
export async function processSmartAlert(
  db: D1Database,
  botToken: string,
  eventType: string,
  payload: GitHubWebhookPayload,
  targetChannels: string[]
): Promise<void> {
  try {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] Processing smart alert for: ${eventType}`);

    const alertData = prepareSmartAlertData(payload, eventType);
    if (!alertData) {
      console.log(`[${timestamp}] No alert data prepared for: ${eventType}`);
      return;
    }

    // Send notification using the generic notification system
    await sendGitHubNotification(
      db,
      botToken,
      eventType,
      alertData,
      'smart_alert',
      targetChannels
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
  
  return 'Update';
}
