# 🔔 Quick Setup Example

Here's a minimal configuration to get your notification system running:

## 1. Environment Variables (.dev.vars)

```bash
# Required for all notifications
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrSTUvwxYZ1234567890
KC_DEV_CHAT_ID=-1001234567890

# Optional - enable development mode for verbose logging
DEV_MODE=false
```

## 2. GitHub Username Mapping (Optional)

The system works with GitHub usernames by default. You can optionally add custom mappings in `src/config/notifications.ts`:

```typescript
mentions: {
  // Optional: Map GitHub username → Telegram username
  // 'github-username': '@telegram-username',
  // Leave empty for open source projects
}
```

## 3. GitHub Webhook Setup

1. Go to your repository → Settings → Webhooks
2. Add webhook URL: `https://your-worker.workers.dev/github/webhook`
3. Select events:
   - ✅ Pull requests
   - ✅ Issues  
   - ✅ Issue comments
   - ✅ Pull request reviews
   - ✅ Pull request review comments
4. Content type: `application/json`

## 4. Test the System

### Test Smart Alerts
1. Open a new PR
2. Should receive: "🧩 New PR Opened: #123 by @username"

### Test Mentions
1. Comment with "@username can you review this?"
2. Should receive: "📣 @username was mentioned in PR #123"
3. Works with any GitHub username automatically

### Test Label Routing
1. Add labels like `security`, `bug`, `design` to PRs
2. Should receive specialized alerts

### Test Manual Trigger
```bash
curl -X POST https://your-worker.workers.dev/notifications/scheduled
```

## 5. Check System Status

```bash
curl https://your-worker.workers.dev/notifications/status
```

Expected response:
```json
{
  "success": true,
  "totalNotificationsSent": 0,
  "notificationsByType": {},
  "systemHealth": "healthy"
}
```

## 6. Enable Scheduling (Optional)

Add to `wrangler.toml`:
```toml
[triggers]
crons = [
  "0 9 * * *",      # Daily pulse at 9 AM
  "0 10 * * 0",     # Weekly pulse Sunday 10 AM  
  "0 6,12,18 * * *" # Reviewer pings every 6 hours
]
```

## 🎯 Example Notifications You'll See

### New PR Opened
```
🧩 New PR Opened: #106 by @li-lay  
🗂️ Title: Fix Follow Button State Inconsistency  
📋 Summary: Resolves issue #104, syncs button state...
⏳ Status: Pending Review  
🔗 View PR
```

### Security Alert
```
🚨 SECURITY ALERT (CRITICAL): PR #107
🗂️ Title: Fix SQL injection vulnerability
👤 Author: @security-dev
🔒 Security Labels: security, vulnerability
⚠️ Immediate attention required!
🔗 View PR
```

### Reviewer Ping
```
⚠️ Review Needed (URGENT): PR #106
🗂️ Title: Fix Follow Button State
👤 Author: @li-lay
⏰ Waiting for: 72 hours
👀 Reviewers: @meex, @dev-noctis
📎 Let's unblock it!
🔗 Review Now
```

### Daily Activity Pulse
```
🧪 GitHub Pulse — Last 24h  
📌 3 New PRs • 1 Merged • 2 Issues Closed  
👥 Contributors: 5 active
🔥 Highlights:
🔀 #106 by @li-lay
🔀 #108 by @meex
```

## 🔧 Quick Troubleshooting

**No notifications?**
- ✅ Check webhook URL is correct
- ✅ Verify TELEGRAM_BOT_TOKEN and KC_DEV_CHAT_ID
- ✅ Ensure bot is added to the Telegram group
- ✅ Check GitHub webhook delivery logs

**Missing mentions?**
- ✅ Mentions work automatically with GitHub usernames
- ✅ Verify comment events are enabled in webhook
- ✅ Add custom mappings only if needed

**Want different notification styles?**
- ✅ Modify templates in `src/config/notifications.ts`
- ✅ Customize routing in `labelBasedRouting.ts`

**Scheduled notifications not working?**
- ✅ Set up cron triggers in `wrangler.toml`
- ✅ Or use external cron to POST `/notifications/scheduled`

## 🚀 You're All Set!

Your modular notification system is now configured and ready to keep your team informed about GitHub activity in real-time!
