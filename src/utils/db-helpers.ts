// Database helpers for message counter

/**
 * Track a message from a user in the database
 *
 * @param db - D1Database instance
 * @param platform - Platform identifier (e.g. 'telegram')
 * @param userId - User ID from the platform
 * @param displayName - User's display name
 * @param messageLength - Length of the message content
 * @returns Promise<void>
 */
export async function trackMessage(
  db: D1Database,
  platform: string,
  userId: number,
  displayName: string,
  messageLength: number
): Promise<void> {
  try {
    const timestamp = new Date().toISOString();
    // Get current date in YYYY-MM-DD format (UTC)
    const today = timestamp.split("T")[0];

    console.log(
      `[${timestamp}] Tracking message for user ${displayName} (${userId}) on ${platform}, length: ${messageLength}`
    );

    // First ensure the user exists in the users table
    await db
      .prepare(
        `INSERT OR IGNORE INTO users (platform, user_id, display_name) 
       VALUES (?, ?, ?)`
      )
      .bind(platform, userId, displayName)
      .run();

    console.log(`[${timestamp}] User record ensured for ${displayName}`);

    // Then update the message count and total message length
    await db
      .prepare(
        `INSERT INTO chat_counter (chat_date, platform, user_id, message_count, message_length)
       VALUES (?, ?, ?, 1, ?)
       ON CONFLICT (chat_date, platform, user_id)
       DO UPDATE SET 
         message_count = message_count + 1,
         message_length = message_length + ?`
      )
      .bind(today, platform, userId, messageLength, messageLength)
      .run();

    console.log(
      `[${timestamp}] Message count and length updated for ${displayName} on ${today}`
    );
  } catch (error) {
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}] Error tracking message:`, error);
    throw error;
  }
}
