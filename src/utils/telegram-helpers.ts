// Telegram helpers for channel and supergroup message recording
import { TelegramMessage } from "../types/telegram";

/**
 * Record a message from a Telegram channel or supergroup in the database
 *
 * @param db - D1Database instance
 * @param message - The Telegram message object
 * @returns Promise<void>
 */
export async function recordTelegramChannelMessage(
  db: D1Database,
  message: TelegramMessage
): Promise<void> {
  try {
    const timestamp = new Date().toISOString();
    // Convert Telegram timestamp to ISO format
    const messageDate = new Date(message.date * 1000).toISOString();

    const chatId = message.chat.id.toString();
    const chatType = message.chat.type;
    const chatTitle = message.chat.title || "Unknown Channel";

    // Get sender info if available
    const senderId = message.from ? message.from.id.toString() : null;
    let senderName = "Unknown User";
    if (message.from) {
      senderName = message.from.first_name
        ? `${message.from.first_name}${
            message.from.last_name ? " " + message.from.last_name : ""
          }`
        : message.from.username || "Unknown User";
    }

    console.log(
      `[${timestamp}] Recording ${chatType} message from chat: ${chatTitle} (${chatId})`
    ); // Determine media type if any
    let mediaType = null;
    if (message.photo) mediaType = "photo";
    if (message.video) mediaType = "video";
    if (message.document) mediaType = "document";
    if (message.audio) mediaType = "audio";

    // Handle forwarded message info
    let forwardedFrom = null;
    if (message.forward_from) {
      forwardedFrom = message.forward_from.first_name
        ? `${message.forward_from.first_name}${
            message.forward_from.last_name
              ? " " + message.forward_from.last_name
              : ""
          }`
        : message.forward_from.username || "Unknown User";
    } else if (message.forward_from_chat) {
      forwardedFrom =
        message.forward_from_chat.title ||
        message.forward_from_chat.username ||
        `Chat ${message.forward_from_chat.id}`;
    }

    // Handle reply to message
    const replyToMessageId =
      message.reply_to_message?.message_id?.toString() || null;

    // Insert message into the database
    await db
      .prepare(
        `INSERT INTO telegram_channel_messages (
          message_id, 
          chat_id, 
          chat_type, 
          chat_title, 
          sender_id, 
          sender_name, 
          message_text, 
          message_date, 
          media_type, 
          forwarded_from, 
          reply_to_message_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        message.message_id.toString(),
        chatId,
        chatType,
        chatTitle,
        senderId,
        senderName,
        message.text || "",
        messageDate,
        mediaType,
        forwardedFrom,
        replyToMessageId
      )
      .run();

    console.log(
      `[${timestamp}] Successfully recorded ${chatType} message from: ${chatTitle}`
    );
  } catch (error) {
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}] Error recording channel message:`, error);
    throw error;
  }
}
