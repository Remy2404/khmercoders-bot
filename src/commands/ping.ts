import { Context } from "hono";
import { TelegramMessage } from "../types/telegram";
import {
  sendTelegramMessage,
  sendTelegramChatAction,
} from "../utils/telegram-helpers";

/**
 * Process the /ping command
 *
 * @param c - Hono context
 * @param message - Telegram message
 * @param botToken - Telegram bot token
 */
export async function processPingCommand(
  c: Context<{ Bindings: CloudflareBindings }>,
  message: TelegramMessage,
  botToken: string
): Promise<void> {
  const chatId = message.chat.id.toString();
  const timestamp = new Date().toISOString();
  const threadId = message.message_thread_id?.toString();
  const messageId = message.message_id;

  try {
    console.log(
      `[${timestamp}] Processing /ping command for chat ${chatId}${
        threadId ? `, thread ${threadId}` : ""
      }`
    );
    console.log(
      `[${timestamp}] Attempting to send 'typing' action for /ping...`
    );
    await sendTelegramChatAction(botToken, chatId, "typing", threadId);
    console.log(`[${timestamp}] 'typing' action sent for /ping.`);

    await sendTelegramMessage(
      botToken,
      chatId,
      "pong",
      threadId,
      messageId // Pass the message ID for reply
    );

    console.log(
      `[${timestamp}] Sent pong reply to message ${messageId} in chat ${chatId}${
        threadId ? `, thread ${threadId}` : ""
      }`
    );
  } catch (error) {
    console.error(`[${timestamp}] Error processing ping command:`, error);
    await sendTelegramMessage(
      botToken,
      chatId,
      "Sorry, an error occurred while processing your ping.",
      threadId,
      messageId
    );
  }
}