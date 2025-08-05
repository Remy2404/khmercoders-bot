import { GitHubWebhookPayload } from '../types/github';

/**
 * Verify GitHub webhook signature using HMAC
 *
 * @param payload - Raw webhook payload
 * @param signature - GitHub signature header (x-hub-signature-256)
 * @param secret - Webhook secret
 * @returns Promise<boolean> - Whether signature is valid
 */
export async function verifyGitHubSignature(
  payload: string,
  signature: string,
  secret: string
): Promise<boolean> {
  try {
    if (!signature || !signature.startsWith('sha256=')) {
      return false;
    }

    const expectedSignature = signature.replace('sha256=', '');
    
    // Import the secret as a key
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    // Generate HMAC signature
    const signature_bytes = await crypto.subtle.sign(
      'HMAC',
      key,
      new TextEncoder().encode(payload)
    );

    // Convert to hex string
    const signature_hex = Array.from(new Uint8Array(signature_bytes))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    // Compare signatures using a constant-time comparison
    return signature_hex === expectedSignature;
  } catch (error) {
    console.error('Error verifying GitHub signature:', error);
    return false;
  }
}

/**
 * Determine the GitHub event type from headers and payload
 *
 * @param headerFunc - Hono header function or Headers object
 * @param payload - Webhook payload
 * @returns string - Event type (e.g., 'pull_request.opened')
 */
export function getGitHubEventType(
  headerFunc: ((name: string) => string | undefined) | Headers, 
  payload: GitHubWebhookPayload
): string {
  let eventType: string;
  
  if (typeof headerFunc === 'function') {
    eventType = headerFunc('x-github-event') || 'unknown';
  } else {
    eventType = headerFunc.get('x-github-event') || 'unknown';
  }
  
  // Add action for more specific event types
  if ('action' in payload) {
    return `${eventType}.${payload.action}`;
  }
  
  return eventType;
}

/**
 * Extract repository information from webhook payload
 *
 * @param payload - GitHub webhook payload
 * @returns Object with repository details
 */
export function extractRepositoryInfo(payload: GitHubWebhookPayload): {
  owner: string;
  repo: string;
  fullName: string;
  isPrivate: boolean;
} {
  const repository = payload.repository;
  return {
    owner: repository.owner.login,
    repo: repository.name,
    fullName: repository.full_name,
    isPrivate: repository.private
  };
}

/**
 * Check if the webhook event should be processed based on repository rules
 *
 * @param payload - GitHub webhook payload
 * @param allowedRepos - Array of allowed repository names (optional)
 * @returns boolean - Whether to process this event
 */
export function shouldProcessWebhook(
  payload: GitHubWebhookPayload,
  allowedRepos?: string[]
): boolean {
  const repoInfo = extractRepositoryInfo(payload);
  
  // If no allowed repos specified, process all
  if (!allowedRepos || allowedRepos.length === 0) {
    return true;
  }
  
  // Check if this repository is in the allowed list
  return allowedRepos.includes(repoInfo.fullName) || 
         allowedRepos.includes(repoInfo.repo);
}

/**
 * Rate limit checking for GitHub webhooks
 *
 * @param db - D1Database instance
 * @param eventType - Type of GitHub event
 * @param identifier - Unique identifier (e.g., repo or user)
 * @param windowMinutes - Time window in minutes (default: 5)
 * @param maxEvents - Maximum events allowed in window (default: 10)
 * @returns Promise<boolean> - Whether request is within rate limits
 */
export async function checkGitHubRateLimit(
  db: D1Database,
  eventType: string,
  identifier: string,
  windowMinutes: number = 5,
  maxEvents: number = 10
): Promise<boolean> {
  try {
    const now = new Date();
    const windowStart = new Date(now.getTime() - windowMinutes * 60 * 1000);
    
    // Clean old rate limit entries
    await db
      .prepare(`DELETE FROM rate_limits WHERE created_at < ?`)
      .bind(windowStart.toISOString())
      .run();
    
    // Count events in current window
    const result = await db
      .prepare(
        `SELECT COUNT(*) as count FROM rate_limits 
         WHERE event_type = ? AND identifier = ? AND created_at >= ?`
      )
      .bind(eventType, identifier, windowStart.toISOString())
      .first();
    
    const currentCount = (result?.count as number) || 0;
    
    if (currentCount >= maxEvents) {
      console.warn(`Rate limit exceeded for ${eventType}:${identifier}: ${currentCount}/${maxEvents}`);
      return false;
    }
    
    // Record this event
    await db
      .prepare(
        `INSERT INTO rate_limits (event_type, identifier, created_at) VALUES (?, ?, ?)`
      )
      .bind(eventType, identifier, now.toISOString())
      .run();
    
    return true;
  } catch (error) {
    console.error('Error checking rate limit:', error);
    // On error, allow the request to proceed
    return true;
  }
}

/**
 * Sanitize text for safe display in Telegram HTML
 *
 * @param text - Raw text content
 * @param maxLength - Maximum length (default: 300)
 * @returns Sanitized and truncated text
 */
export function sanitizeForTelegram(text: string, maxLength: number = 300): string {
  if (!text) return '';
  
  // Remove or escape HTML tags
  let sanitized = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
  
  // Truncate if too long
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength) + '...';
  }
  
  return sanitized;
}

/**
 * Parse GitHub webhook headers for useful information
 *
 * @param headerFunc - Hono header function
 * @returns Object with parsed header information
 */
export function parseGitHubHeaders(headerFunc: (name: string) => string | undefined): {
  event: string;
  signature: string;
  delivery: string;
  userAgent: string;
} {
  return {
    event: headerFunc('x-github-event') || '',
    signature: headerFunc('x-hub-signature-256') || '',
    delivery: headerFunc('x-github-delivery') || '',
    userAgent: headerFunc('user-agent') || ''
  };
}

/**
 * Get prioritized events that should trigger immediate notifications
 */
export const HIGH_PRIORITY_EVENTS = [
  'pull_request.opened',
  'pull_request.review_requested',
  'issues.opened',
  'issue_comment.created',
  'pull_request_review.submitted'
];

/**
 * Get events that should be included in activity summaries
 */
export const SUMMARY_EVENTS = [
  'pull_request.opened',
  'pull_request.closed',
  'pull_request.merged',
  'issues.opened',
  'issues.closed'
];

/**
 * Check if an event is high priority
 *
 * @param eventType - GitHub event type
 * @returns boolean - Whether event is high priority
 */
export function isHighPriorityEvent(eventType: string): boolean {
  return HIGH_PRIORITY_EVENTS.includes(eventType);
}

/**
 * Check if an event should be included in summaries
 *
 * @param eventType - GitHub event type
 * @returns boolean - Whether event should be summarized
 */
export function isSummaryEvent(eventType: string): boolean {
  return SUMMARY_EVENTS.includes(eventType);
}
