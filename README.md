# KhmerCoders Bot

## Introduction

This is a Khmer Coders bot for Telegram and Discord platforms. At the moment, it's primarily used for counting the number of messages sent by each member in a group and creating leaderboards.

## How to Run

### Setup

1. Clone the repository
2. Install dependencies:

```
npm install
```

### Running the Service

To run the service locally:

```
npm run dev
```

This will start the Cloudflare worker on your local machine at http://localhost:8787.

### Database Migrations

This project uses Cloudflare D1 for database storage. The database schema is defined in the migrations directory.

#### Development Migrations

To apply migrations to your local development database:

```
npm run migrate:dev
```

#### Production Migrations

To apply migrations to the production database:

```
npm run migrate:prod
```

### Telegram Bot Setup

1. Create a bot by messaging [@BotFather](https://t.me/BotFather) on Telegram
2. Use the /newbot command to create a new bot
3. Follow the instructions to choose a name and username for your bot
4. BotFather will provide you with a bot token - save this for later

#### Configuring the Webhook

Telegram needs to know where to send updates. After deploying your worker, set the webhook URL:

```
https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook?url=https://your-worker-url.workers.dev/telegram/webhook
```

Replace <YOUR_BOT_TOKEN> with your actual bot token and the URL with your deployed Worker URL.

### Testing Webhook Locally

To test the webhook with a sample Telegram message:

```
npm run test:webhook
```

This will send a test message to your webhook endpoint on your local development server.

## Contribution

We are happy to accept contributions from the community! Here's how you can help:

1. Fork the repository
2. Create a new branch for your feature
3. Make your changes
4. Write or update tests if necessary
5. Submit a pull request

### Development Guidelines

- Follow the existing code style and patterns
- Add comments for complex logic
- Keep the codebase clean and maintainable
- Write meaningful commit messages

If you have any questions or suggestions, feel free to open an issue or reach out to the community!
