import { Hono } from "hono";
import { TelegramUpdate } from "./types/telegram";
import { DiscordWebhookPayload } from "./types/discord";
import { trackMessage } from "./utils/db-helpers";

const app = new Hono<{ Bindings: CloudflareBindings }>();

app.get("/", (c) => {
  return c.text("Welcome to KhmerCoders Chatbot");
});

// Handle Telegram webhook requests
app.post("/telegram/webhook", async (c) => {
  try {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] Received Telegram webhook request`);

    // Parse the incoming webhook data
    const update: TelegramUpdate = await c.req.json();

    // Early return if no message data found
    if (
      !update.message &&
      !update.edited_message &&
      !update.channel_post &&
      !update.edited_channel_post
    ) {
      console.log(`[${timestamp}] No message data found in the update`);
      return c.json({ success: false, error: "No message data found" });
    }

    // Use the first available message from the update
    const message =
      update.message ||
      update.edited_message ||
      update.channel_post ||
      update.edited_channel_post;

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
});

// Handle Discord webhook requests
app.post("/discord/webhook", async (c) => {
  try {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] Received Discord webhook request`);

    // Parse the incoming webhook data
    const payload: DiscordWebhookPayload = await c.req.json();

    // Early return if no message data or user ID found
    if (!payload || !payload.username || !payload.user_id) {
      console.log(
        `[${timestamp}] No valid message data found in the Discord webhook payload`
      );
      return c.json({ success: false, error: "No valid message data found" });
    }

    // Use the username as the display name
    const displayName = payload.username || "Unknown Discord User";

    // Use the user_id directly as a string
    const userId = payload.user_id;

    const text = payload.content || "";

    console.log(
      `[${timestamp}] Processing message from Discord user: ${displayName} (ID: ${payload.user_id})`
    );

    // Track the message in our database
    await trackMessage(c.env.DB, "discord", userId, displayName, text.length);

    console.log(
      `[${timestamp}] Successfully tracked message from Discord user: ${displayName}`
    );
    return c.json({ success: true });
  } catch (error) {
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}] Error processing Discord webhook:`, error);
    return c.json({ success: false, error: "Internal server error" }, 500);
  }
});

export default app;
