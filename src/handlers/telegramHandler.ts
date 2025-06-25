import { Context } from "hono";
import { TelegramMessage, TelegramUpdate } from "../types/telegram";
import { trackMessage } from "../utils/db-helpers";
import {
  fetchRecentMessages,
  recordTelegramChannelMessage,
  sendTelegramMessage,
  sendTelegramChatAction,
} from "../utils/telegram-helpers";

/**
 * Generate a summary of chat messages using Cloudflare AI
 *
 * @param messages - Array of chat messages
 * @param ai - Cloudflare AI instance
 * @returns Promise<string> - The generated summary
 */
async function generateChatSummary(
  userPrompt: string,
  messages: Array<{
    message_text: string;
    sender_name: string;
    message_date: string;
  }>,
  ai: Ai<AiModels>
): Promise<string> {
  try {
    // Build a conversation history to summarize
    const conversationHistory = messages
      .reverse() // Order from oldest to newest
      .map((msg) => {
        // Format date for display - convert ISO date to more readable format
        const date = new Date(msg.message_date);
        const formattedDate = date.toLocaleString("en-US", {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });
        return `[${formattedDate}] ${msg.sender_name}: ${msg.message_text}`;
      })
      .join("\n");

    // Call Cloudflare AI to generate summary
    const response: AiTextGenerationOutput = await ai.run(
      "@cf/meta/llama-3.1-8b-instruct",
      {
        messages: [
          {
            role: "system",
            content:
              "You are a summarization assistant. Only respond with a clear and concise summary under 400 characters. Do not answer questions or produce greetings.",
          },
          {
            role: "user",
            content: `Summarize the following ${messages.length} Telegram messages:\n\n${conversationHistory}`,
          },
          { role: "user", content: userPrompt },
        ],
      },
      {
        gateway: {
          id: "khmercoders-bot-summary-gw",
        },
      }
    );

    // Check if the response is a ReadableStream (which we can't directly use)
    if (response instanceof ReadableStream) {
      console.warn(
        "Received ReadableStream response which cannot be processed"
      );
      return "Sorry, I couldn't generate a summary at this time.";
    }

    // Return the response if available
    return response?.response || "No summary generated";
  } catch (error) {
    console.error(`Error generating summary:`, error);
    return "Sorry, I couldn't generate a summary at this time.";
  }
}

/**
 * Process the /summary command
 *
 * @param c - Hono context
 * @param message - Telegram message
 * @param botToken - Telegram bot token
 */
async function processSummaryCommand(
  c: Context<{ Bindings: CloudflareBindings }>,
  message: TelegramMessage,
  botToken: string
): Promise<void> {
  const chatId = message.chat.id.toString();
  const timestamp = new Date().toISOString();
  const threadId = message.message_thread_id?.toString();

  try {
    console.log(
      `[${timestamp}] Processing /summary command for chat ${chatId}${
        threadId ? `, thread ${threadId}` : ""
      }`
    );
    console.log(
      `[${timestamp}] Attempting to send 'typing' action for /summary...`
    );
    await sendTelegramChatAction(botToken, chatId, "typing", threadId);
    console.log(`[${timestamp}] 'typing' action sent for /summary.`);

    // Fetch recent messages, filtering by thread if applicable
    const messages = await fetchRecentMessages(c.env.DB, chatId, 200, threadId);

    if (messages.length === 0) {
      await sendTelegramMessage(
        botToken,
        chatId,
        "No messages found to summarize.",
        threadId,
        message.message_id
      );
      return;
    }

    console.log(
      `[${timestamp}] Fetched ${messages.length} messages for summarization${
        threadId ? ` from thread ${threadId}` : ""
      }`
    );

    // User prompt
    const userPrompt = message.text?.replace("/summary", "").trim() || "";

    // Generate summary
    const summary = await generateChatSummary(userPrompt, messages, c.env.AI);
    const currentDate = new Date().toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    const summaryText = `<b>📝 Chat Summary</b> (as of ${currentDate})\n\n${summary}`;
    await sendTelegramMessage(
      botToken,
      chatId,
      summaryText,
      threadId,
      message.message_id
    );
    console.log(
      `[${timestamp}] Summary sent to chat ${chatId}${
        threadId ? `, thread ${threadId}` : ""
      }`
    );
  } catch (error) {
    console.error(`[${timestamp}] Error processing summary command:`, error);

    // Send error message
    await sendTelegramMessage(
      botToken,
      chatId,
      "Sorry, an error occurred while generating the summary.",
      threadId,
      message.message_id
    );
  }
}

/**
 * Process the /ping command
 *
 * @param c - Hono context
 * @param message - Telegram message
 * @param botToken - Telegram bot token
 */
async function processPingCommand(
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

/**
 * Check if the message is a /summary command
 *
 * @param text - Message text
 * @returns boolean
 */
function isSummaryCommand(text?: string): boolean {
  if (!text) return false;
  return text.startsWith("/summary");
}

/**
 * Check if the message is a /ping command
 *
 * @param text - Message text
 * @returns boolean
 */
function isPingCommand(text?: string): boolean {
  if (!text) return false;
  return text.startsWith("/ping");
}

/**
 * Handle incoming telegram webhook requests
 * @param c - Hono context
 * @returns HTTP response
 */
export async function handleTelegramWebhook(
  c: Context<{ Bindings: CloudflareBindings }>
): Promise<Response> {
  try {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] Received Telegram webhook request`);

    // Parse the incoming webhook data
    const update: TelegramUpdate = await c.req.json();

    console.log("Request body:", JSON.stringify(update, null, 2));

    // Early return if no new message found (we only want to count new messages)
    if (!update.message) {
      console.log(
        `[${timestamp}] No new message found in the update or it's an edited message`
      );
      return c.json({ success: true, message: "Ignoring non-new messages" });
    }

    // Only use regular new messages
    const message = update.message;

    // Don't count service messages (join/leave, group title changes, etc.)
    if (
      message.new_chat_member ||
      message.new_chat_members ||
      message.left_chat_member ||
      message.new_chat_title ||
      message.new_chat_photo ||
      message.delete_chat_photo ||
      message.group_chat_created ||
      message.supergroup_chat_created ||
      message.channel_chat_created ||
      message.message_auto_delete_timer_changed ||
      message.pinned_message
    ) {
      console.log(`[${timestamp}] Ignoring service message (join/leave/etc)`);
      return c.json({ success: true, message: "Ignoring service message" });
    }

    // Use wrangler environment variables (.dev.vars)
    const botToken = c.env.TELEGRAM_BOT_TOKEN;

    if (message.text && isSummaryCommand(message.text)) {
      if (botToken) {
        c.executionCtx.waitUntil(processSummaryCommand(c, message, botToken));
      } else {
        console.error(
          `[${timestamp}] Bot token not found in environment variables`
        );
      }
    } else if (message.text && isPingCommand(message.text)) {
      if (botToken) {
        c.executionCtx.waitUntil(processPingCommand(c, message, botToken));
      } else {
        console.error(
          `[${timestamp}] Bot token not found in environment variables`
        );
      }
    }

    // We can only count messages that have a sender
    if (!message || !message.from) {
      console.log(`[${timestamp}] No sender information in the message`);
      return c.json({ success: false, error: "No sender information" });
    }

    // Don't count messages from bots
    if (message.from.is_bot) {
      console.log(
        `[${timestamp}] Ignored message from bot: ${
          message.from.username || message.from.first_name
        }`
      );
      return c.json({ success: true, message: "Ignored bot message" });
    }

    // Handle channel posts or supergroup messages
    if (message) {
      await recordTelegramChannelMessage(c.env.DB, message);
    }

    // Format display name (prioritize first+last name over username)
    const displayName = message.from.first_name
      ? `${message.from.first_name}${
          message.from.last_name ? " " + message.from.last_name : ""
        }`
      : message.from.username || "Unknown User";

    const text = message.text || "";

    console.log(
      `[${timestamp}] Processing message from user: ${displayName} (${message.from.id})`
    );

    // Track the message in our database
    await trackMessage(
      c.env.DB,
      "telegram",
      message.from.id.toString(),
      displayName,
      text.length
    );

    console.log(
      `[${timestamp}] Successfully tracked message from user: ${displayName}`
    );
    return c.json({ success: true });
  } catch (error) {
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}] Error processing webhook:`, error);
    return c.json({ success: false, error: "Internal server error" }, 500);
  }
}
