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

    // Get message thread ID if it exists
    const messageThreadId = message.message_thread_id?.toString() || null;

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
          reply_to_message_id,
          message_thread_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
        replyToMessageId,
        messageThreadId
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

/**
 * Send a message to a Telegram chat
 *
 * @param botToken - The Telegram bot token
 * @param chatId - The chat ID to send the message to
 * @param text - The message text to send
 * @param threadId - Optional message thread ID for forum topics
 * @returns Promise<Response>
 */
export async function sendTelegramMessage(
  botToken: string,
  chatId: string | number,
  text: string,
  threadId?: string | number,
  replyToMessageId?: number
): Promise<Response> {
  const apiUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;

  const payload: {
    chat_id: string | number;
    text: string;
    message_thread_id?: string | number;
    parse_mode: "HTML";
    reply_to_message_id?: number;
  } = {
    chat_id: chatId,
    text: text,
    parse_mode: "HTML", // Use HTML parsing for better formatting
  };

  if (threadId) {
    payload.message_thread_id = threadId;
  }

  if (replyToMessageId) {
    payload.reply_to_message_id = replyToMessageId;
  }

  return fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

/**
 * Fetch recent messages from a Telegram chat
 *
 * @param db - D1Database instance
 * @param chatId - The chat ID to fetch messages from
 * @param threadId - Optional thread ID to filter messages by thread
 * @param limit - The maximum number of messages to fetch
 * @returns Promise<Array<{ message_text: string, sender_name: string, message_date: string, message_thread_id: string }>>

 */
export async function fetchRecentMessages(
  db: D1Database,
  chatId: string,
  limit: number = 200,
  threadId?: string
): Promise<
  Array<{
    message_text: string;
    sender_name: string;
    message_date: string;
    message_thread_id?: string;
  }>
> {
  try {
    let query = `SELECT message_text, sender_name, message_date, message_thread_id FROM telegram_channel_messages 
                WHERE chat_id = ? AND message_text != ''`;

    const params = [chatId];
    // Add thread filter if threadId is provided
    if (threadId) {
      query += ` AND message_thread_id = ?`;
      params.push(threadId);
    }

    query += ` ORDER BY message_date DESC LIMIT ?`;
    params.push(limit.toString());

    const messages = await db
      .prepare(query)
      .bind(...params)
      .all();

    return messages.results as Array<{
      message_text: string;
      sender_name: string;
      message_date: string;
      message_thread_id?: string;
    }>;
  } catch (error) {
    console.error(`Error fetching messages:`, error);
    throw error;
  }
}

/**
 * Edit an existing message in a Telegram chat
 *
 * @param botToken - The Telegram bot token
 * @param chatId - The chat ID where the message is
 * @param messageId - The ID of the message to edit
 * @param text - The new text for the message
 * @param threadId - Optional message thread ID for forum topics
 * @returns Promise<Response>
 */
export async function editTelegramMessage(
  botToken: string,
  chatId: string | number,
  messageId: number,
  text: string,
  threadId?: string | number
): Promise<Response> {
  const apiUrl = `https://api.telegram.org/bot${botToken}/editMessageText`;

  const payload: {
    chat_id: string | number;
    message_id: number;
    text: string;
    message_thread_id?: string | number;
    parse_mode?: string;
  } = {
    chat_id: chatId,
    message_id: messageId,
    text: text,
    parse_mode: "HTML", // Use HTML parsing for better formatting
  };

  if (threadId) {
    payload.message_thread_id = threadId;
  }

  return fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}
