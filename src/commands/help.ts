import { Context } from "hono";
import { TelegramMessage } from "../types/telegram";
import {
  sendTelegramMessage,
  sendTelegramChatAction,
} from "../utils/telegram-helpers";

/**
 * Process the /help command
 *
 * @param c - Hono context
 * @param message - Telegram message
 * @param botToken - Telegram bot token
 */
export async function processHelpCommand(
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
      `[${timestamp}] Processing /help command for chat ${chatId}${
        threadId ? `, thread ${threadId}` : ""
      }`
    );
    console.log(
      `[${timestamp}] Attempting to send 'typing' action for /help...`
    );
    await sendTelegramChatAction(botToken, chatId, "typing", threadId);
    console.log(`[${timestamp}] 'typing' action sent for /help.`);

    const helpMessage = `
    <b>🤖 Available Commands:</b>

o /help - Displays this help message.
o /summary - Summarizes recent chat messages.
o /ping - Checks if the bot is online.
    `;

    await sendTelegramMessage(
      botToken,
      chatId,
      helpMessage,
      threadId,
      messageId
    );

    console.log(
      `[${timestamp}] Sent help message to chat ${chatId}${
        threadId ? `, thread ${threadId}` : ""
      }`
    );
  } catch (error) {
    console.error(`[${timestamp}] Error processing help command:`, error);
    await sendTelegramMessage(
      botToken,
      chatId,
      "Sorry, an error occurred while processing your help request.",
      threadId,
      messageId
    );
  }
}