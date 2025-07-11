import { Context } from 'hono';
import { TelegramMessage } from '../types/telegram';
import { sendTelegramMessage, sendTelegramChatAction } from '../utils/telegram-helpers';

/**
 * Process the /link command
 * This command should only work in private messages
 *
 * @param c - Hono context
 * @param message - Telegram message
 * @param botToken - Telegram bot token
 */
export async function processLinkCommand(
  c: Context<{ Bindings: CloudflareBindings }>,
  message: TelegramMessage,
  botToken: string
): Promise<void> {
  const chatId = message.chat.id.toString();
  const timestamp = new Date().toISOString();
  const messageId = message.message_id;

  try {
    console.log(`[${timestamp}] Processing /link command for chat ${chatId}`);

    // Check if this is a private message
    if (message.chat.type !== 'private') {
      console.log(
        `[${timestamp}] /link command attempted in non-private chat: ${message.chat.type}`
      );
      await sendTelegramMessage(
        botToken,
        chatId,
        '❌ The /link command can only be used in private messages.',
        undefined,
        messageId
      );
      return;
    }

    // Extract the code from the message
    const text = message.text || '';
    const parts = text.trim().split(/\s+/);

    // Check if no code was provided
    if (parts.length === 1) {
      await sendTelegramMessage(
        botToken,
        chatId,
        '❌ Invalid format. Please use: /link &lt;code&gt;',
        undefined,
        messageId
      );
      return;
    }

    // Check if code is empty or just whitespace
    if (parts.length < 2 || !parts[1] || parts[1].trim() === '') {
      await sendTelegramMessage(
        botToken,
        chatId,
        '❌ Invalid format. Please use: /link &lt;code&gt;',
        undefined,
        messageId
      );
      return;
    }

    if (parts.length > 2) {
      await sendTelegramMessage(
        botToken,
        chatId,
        '❌ Invalid format. Please use: /link &lt;code&gt; (code should not contain spaces)',
        undefined,
        messageId
      );
      return;
    }

    const code = parts[1].trim();

    // Validate code format: exactly 9 characters, alphanumeric only
    if (code.length !== 9) {
      await sendTelegramMessage(
        botToken,
        chatId,
        '❌ Invalid code format. Code must be exactly 9 characters long.',
        undefined,
        messageId
      );
      return;
    }

    // Check if code contains only alphanumeric characters
    const alphanumericRegex = /^[a-zA-Z0-9]+$/;
    if (!alphanumericRegex.test(code)) {
      await sendTelegramMessage(
        botToken,
        chatId,
        '❌ Invalid code format. Code must contain only letters and numbers.',
        undefined,
        messageId
      );
      return;
    }

    // Get user information for logging
    const displayName = message.from?.first_name
      ? `${message.from.first_name}${message.from.last_name ? ' ' + message.from.last_name : ''}`
      : message.from?.username || 'Unknown User';
    const userId = message.from?.id.toString() || 'Unknown ID';

    console.log(
      `[${timestamp}] Attempting to link account with code: ${code} for user: ${displayName} (${userId})`
    );

    await sendTelegramChatAction(botToken, chatId, 'typing');

    // Call the API to validate the code
    const apiUrl = `https://khmercoder.com/api/account/link/${code}`;

    try {
      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        await sendTelegramMessage(
          botToken,
          chatId,
          '❌ Invalid or expired code. Please check your code and try again.',
          undefined,
          messageId
        );
        return;
      }

      const result = (await response.json()) as { success: boolean; userId?: string };

      if (!result.success || !result.userId) {
        await sendTelegramMessage(
          botToken,
          chatId,
          '❌ Invalid or expired code. Please check your code and try again.',
          undefined,
          messageId
        );
        return;
      }

      // Update the database with the linked user ID
      const userId = message.from?.id.toString();
      const displayName = message.from?.first_name
        ? `${message.from.first_name}${message.from.last_name ? ' ' + message.from.last_name : ''}`
        : message.from?.username || 'Unknown User';

      if (!userId) {
        console.error(`[${timestamp}] No user ID found in message`);
        await sendTelegramMessage(
          botToken,
          chatId,
          '❌ Unable to process your request. Please try again.',
          undefined,
          messageId
        );
        return;
      }

      // Insert or update the user with the linked_user_id
      await c.env.DB.prepare(
        `INSERT INTO users(platform, user_id, display_name, linked_user_id) 
           VALUES(?, ?, ?, ?)
           ON CONFLICT(platform, user_id) 
           DO UPDATE SET linked_user_id = excluded.linked_user_id, display_name = excluded.display_name`
      )
        .bind('telegram', userId, displayName, result.userId)
        .run();

      console.log(
        `[${timestamp}] Successfully linked user ${displayName} (${userId}) to website account ${result.userId}`
      );

      await sendTelegramMessage(
        botToken,
        chatId,
        '✅ Your account has been successfully linked!',
        undefined,
        messageId
      );
    } catch (apiError) {
      console.error(`[${timestamp}] Error calling link API:`, apiError);
      await sendTelegramMessage(
        botToken,
        chatId,
        '❌ Unable to verify the code. Please try again later.',
        undefined,
        messageId
      );
    }
  } catch (error) {
    console.error(`[${timestamp}] Error processing link command:`, error);
    await sendTelegramMessage(
      botToken,
      chatId,
      '❌ Sorry, an error occurred while processing your link request.',
      undefined,
      messageId
    );
  }
}
