import { Context } from "hono";
import { TelegramMessage } from "../types/telegram";
import {
  fetchRecentMessages,
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
      "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
      {
        messages: [
          {
            role: "system",
            content: `
            You are Khmercoders assistant. Your main task is to provide brief 50 - 100 words, easy-to-read summaries of chat history.
            
            ---
            Format

            When you respond, use these HTML tags for formatting:
            - Use <b>text</b> for bold formatting
            - Use <i>text</i> for italic formatting
            - Use <code>text</code> for inline code
            - Use <pre>text</pre> for code blocks
            - Use <tg-spoiler>spoiler</tg-spoiler> for spoilers
            
            Escape special characters: 
            - replace < with &lt;
            - replace > with &gt;
            - replace & with &amp;
            - replace " with &quot;
            ---

            ---
            Your Restrictions:

            Summaries Only: Your primary purpose is to summarize chat conversations. Make sure summaries are short and concise for quick reading.

            "Who are you?" Exception: If someone asks "Who are you?", you can briefly state that you are the Khmercoders Assistant.

            No Other Topics: Do not answer any other questions or engage in conversations outside of summarizing chats or stating your identity. Politely decline if asked to do anything else.
            ---
            `,
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
export async function processSummaryCommand(
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