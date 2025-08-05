# 🔔 Modular Notification Alert System

A comprehensive and modular notification system for your Telegram bot that handles GitHub PR and issue notifications with smart routing, scheduling, and custom alerts.

## 📋 Overview

The notification system consists of 5 modular components that work together to provide intelligent GitHub-to-Telegram notifications:

1. **🧩 Smart Alert Summary** - Clean, readable notifications for all PR/Issue events
2. **📣 DevMentions Alert** - Intelligent @mention detection with action tracking
3. **🧪 Activity Pulse Report** - Scheduled summaries of repository activity
4. **⏰ Reviewer Ping System** - Automated reminders for stale PRs awaiting review
5. **🏷️ Label-Based Routing** - Smart routing based on labels to appropriate channels

All notifications target the **"KC Platform Development"** channel by default, with configurable routing for specialized alerts.

---

## 🚀 Quick Start

### 1. Environment Setup

Ensure these environment variables are configured:

```bash
# Required
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
KC_DEV_CHAT_ID=your_telegram_chat_id

# Optional - enable development mode for verbose logging
DEV_MODE=false
```

### 2. GitHub Webhook Configuration

Configure your GitHub repository webhook to point to:
```
POST https://your-worker-domain.workers.dev/github/webhook
```

Required events:
- Pull requests
- Issues  
- Issue comments
- Pull request reviews
- Pull request review comments

### 3. Database Migration

Run the migration to set up the notification tables:
```sql
-- This creates the necessary tables for tracking notifications
-- See migrations/0006_github_notifications.sql
```

---

## 🧩 Notification Types

### 1. Smart Alert Summary

**Triggers:** PR opened, closed, merged | Issue opened, closed

**Example Output:**
```
🧩 New PR Opened: #106 by @contributor  
🗂️ Title: Fix Follow Button State Inconsistency  
📋 Summary: Resolves issue #104, syncs button state across views  
⏳ Status: Pending Review  
🔗 View PR
```

**Features:**
- Clean, mobile-friendly formatting
- Automatic status detection
- Summary generation from PR/issue body
- Labels and milestone information
- Linked issues detection

---

### 2. DevMentions Alert

**Triggers:** @mentions in PR descriptions, issue comments, review comments

**Example Output:**
```
📣 @username was mentioned in PR #109 by @contributor  
🧾 Context: "Can you validate the D1 query result parsing?"
🎯 Action needed!
🔗 View PR
```

**Features:**
- Smart mention detection (ignores bots)
- Context extraction around mentions
- Automatic GitHub username detection
- Acknowledgment tracking
- Action requirement detection

**Configuration:** The system automatically detects GitHub usernames from mentions. No additional configuration required.

---

### 3. Activity Pulse Report

**Triggers:** Scheduled (daily 9 AM, weekly Sunday 10 AM)

**Example Output:**
```
🧪 GitHub Pulse — Last 24h  
📌 3 New PRs • 1 Merged • 2 Issues Closed  
👥 Contributors: 5 active
🔥 Highlights:
🔀 #106 by @contributor
🔀 #108 by @developer

Updated: Aug 5, 10:30 AM
```

**Features:**
- Daily and weekly summaries
- Contributor highlights
- Activity metrics
- Recent PR/issue highlights
- Quiet period detection

**Manual Trigger:**
```bash
# Trigger via API
POST /notifications/scheduled
```

---

### 4. Reviewer Ping System

**Triggers:** PRs waiting for review (36h, 72h, 5 days, 7 days)

**Example Output:**
```
⚠️ Review Needed (URGENT): PR #106
🗂️ Title: Fix Follow Button State Inconsistency
👤 Author: @contributor
⏰ Waiting for: 72 hours
👀 Reviewers: @reviewer1, @reviewer2
📢 Previous pings: 1

📎 Let's unblock it!
🔗 Review Now
```

**Features:**
- Escalating urgency levels (normal → urgent → critical)
- Multiple reviewer support
- Previous ping tracking
- Customizable time thresholds
- Review request immediate notifications

**Ping Schedule:**
- 36 hours: First reminder
- 72 hours: Second reminder  
- 5 days: Urgent status
- 7 days: Critical status

---

### 5. Label-Based Routing

**Triggers:** PRs/Issues with specific labels

**Example Routing Rules:**

#### Security Alerts → Dev Channel
```
🚨 SECURITY ALERT (CRITICAL): PR #107
🗂️ Title: Fix SQL injection vulnerability
👤 Author: @security-dev
🔒 Security Labels: security, vulnerability
⚠️ Immediate attention required!
🔗 View PR
```

#### Design/UX → Dev Channel
```
🎨 Design/UX Update: PR #108
🗂️ Title: Redesign login flow
👤 Author: @ui-designer
🏷️ Design Labels: ux, design, frontend
👀 Design team review needed
🔗 View PR
```

#### Performance Issues
```
⚡ Performance Update: PR #109
🗂️ Title: Optimize database queries
👤 Author: @performance-dev
📊 Type: Performance / Optimization
🚀 Speed improvements incoming!
🔗 View PR
```

**Supported Label Categories:**
- **Security:** `security`, `vulnerability`, `critical`, `cve`
- **Design/UX:** `ux`, `design`, `ui`, `frontend`, `styling`
- **Bugs:** `bug`, `hotfix`, `urgent`, `production`
- **Performance:** `performance`, `optimization`, `slow`
- **Documentation:** `documentation`, `docs`, `readme`
- **Infrastructure:** `dependencies`, `infrastructure`, `ci`, `devops`

---

## ⚙️ Configuration

### Notification Rules

Edit `src/config/notifications.ts` to customize notification behavior:

```typescript
export const notificationConfig: NotificationConfig = {
  channels: {
    'kc_dev': {
      chatId: process.env.KC_DEV_CHAT_ID,
      name: 'KC Platform Development',
      type: 'group'
    }
  },
  
  // GitHub usernames are automatically detected from mentions
  // No additional configuration required
  
  rules: [
    // Customize which events trigger which notifications
    // See full configuration in the file
  ]
};
```

### Scheduler Configuration

Control which notification types are enabled:

```typescript
const config = {
  enableSmartAlerts: true,
  enableMentionAlerts: true,
  enableActivityPulse: true,
  enableReviewerPings: true,
  enableLabelRouting: true,
  defaultChannels: ['kc_dev']
};
```

---

## 🛠️ API Endpoints

### Webhook Endpoints
```bash
POST /github/webhook       # Main GitHub webhook handler
POST /github/ping          # GitHub webhook test/ping
POST /telegram/webhook     # Telegram bot webhook
```

### Management Endpoints
```bash
POST /notifications/scheduled    # Trigger scheduled notifications
GET  /notifications/status       # Get system status and metrics
```

### Status Response Example
```json
{
  "success": true,
  "totalNotificationsSent": 1234,
  "notificationsByType": {
    "smart_alert": 567,
    "mention_alert": 234,
    "reviewer_ping": 123,
    "activity_pulse": 45,
    "security_alert": 12
  },
  "recentActivity": [...],
  "systemHealth": "healthy"
}
```

---

## 🕐 Scheduling

The system includes automatic scheduling for time-based notifications:

### Activity Pulse Reports
- **Daily:** Every day at 9:00 AM
- **Weekly:** Every Sunday at 10:00 AM

### Reviewer Ping Checks  
- **Every 6 hours** during business hours (6 AM, 12 PM, 6 PM)

### Setting Up Cron Jobs

For Cloudflare Workers, use [Cron Triggers](https://developers.cloudflare.com/workers/platform/triggers/cron-triggers/):

```toml
# wrangler.toml
[triggers]
crons = [
  "0 9 * * *",    # Daily at 9 AM (activity pulse)
  "0 10 * * 0",   # Weekly on Sunday at 10 AM (weekly pulse)
  "0 6,12,18 * * *" # Every 6 hours for reviewer pings
]
```

Or use external cron services to hit the scheduled endpoint:
```bash
curl -X POST https://your-worker.workers.dev/notifications/scheduled
```

---

## 🔧 Customization

### Adding New Notification Types

1. Create a new file in `src/notifications/`
2. Implement the notification interface
3. Add to the scheduler in `notificationScheduler.ts`
4. Update configuration and templates

### Custom Label Routing

Add new routing rules in `src/notifications/labelBasedRouting.ts`:

```typescript
export const labelRoutingRules: LabelRoutingRule[] = [
  {
    labels: ['your-custom-label'],
    targetChannels: ['kc_dev'],
    template: 'custom_alert',
    priority: 'high',
    conditions: {
      eventTypes: ['pull_request.opened']
    }
  }
];
```

### Custom Message Templates

Add templates in `src/config/notifications.ts`:

```typescript
custom_alert: {
  default: (data: any) => `
🎯 Custom Alert: ${data.type} #${data.number}
🗂️ Title: ${data.title}
👤 Author: @${data.author}
🔗 View ${data.type}
  `
}
```

---

## 🐛 Troubleshooting

### Common Issues

**No notifications received:**
1. Check webhook URL configuration
2. Verify environment variables
3. Check database migrations
4. Review notification rules

**Missing mentions:**
1. Verify GitHub ↔ Telegram username mapping
2. Check mention detection patterns
3. Ensure comment events are enabled

**Scheduled notifications not working:**
1. Set up cron triggers or external scheduler
2. Check endpoint accessibility
3. Verify database permissions

### Debug Mode

Enable detailed logging:
```bash
# Set DEV_MODE=true for verbose logs
DEV_MODE=true
```

### Status Monitoring

Check system health:
```bash
curl https://your-worker.workers.dev/notifications/status
```

---

## 📊 Metrics & Analytics

The system automatically tracks:
- Total notifications sent
- Notifications by type
- Recent activity
- System health status
- Response rates and acknowledgments

Access via the status endpoint or database queries.

---

## 🔄 Migration Guide

If upgrading from the basic notification system:

1. **Run database migration:** `0006_github_notifications.sql`
2. **Update webhook handlers:** Use new `notificationScheduler`
3. **Configure new templates:** Add missing templates to config
4. **Set up scheduling:** Configure cron triggers
5. **Test thoroughly:** Verify all notification types work

---

## 📝 Examples

### Testing Notifications

1. **Create a test PR** with labels to trigger routing
2. **Mention team members** in comments to test mentions
3. **Request reviews** to test reviewer pings
4. **Manually trigger** scheduled reports via API

### Sample Workflow

1. Developer opens PR with `security` label
2. **Label routing** sends security alert to both channels
3. **Smart alert** sends basic PR notification
4. Developer mentions reviewer in comment
5. **Mention alert** notifies the reviewer
6. After 36 hours without review
7. **Reviewer ping** sends reminder
8. **Activity pulse** includes PR in daily summary

---

## 🤝 Contributing

To add new notification types:

1. Follow the existing pattern in `src/notifications/`
2. Update the scheduler and configuration
3. Add appropriate tests
4. Update documentation

---

## 📞 Support

- Check the status endpoint for system health
- Review logs for debugging information
- Verify configuration matches your setup
- Test with sample webhooks

---

**🎉 Your notification system is now ready to keep your team informed and productive!**
