import { NotificationConfig } from '../types/github';

// Notification configuration for KC Platform Development
export const notificationConfig: NotificationConfig = {
  channels: {
    'kc_dev': {
      chatId: '', // Will be set from environment variable KC_DEV_CHAT_ID
      name: 'KC Platform Development',
      type: 'group'
    }
  },
  
  // Map GitHub usernames to Telegram usernames for mentions (optional)
  // Leave empty for open source projects - mentions will use GitHub usernames
  mentions: {
    // Example: 'github-username': '@telegram-username'
    // Add mappings only if you want to override GitHub usernames
  },

  rules: [
    // Smart Alert Summary - All PR/Issue events
    {
      eventType: 'pull_request.opened',
      channels: ['kc_dev'],
      template: 'smart_alert',
      enabled: true
    },
    {
      eventType: 'pull_request.closed',
      channels: ['kc_dev'],
      template: 'smart_alert',
      enabled: true
    },
    {
      eventType: 'issues.opened',
      channels: ['kc_dev'],
      template: 'smart_alert',
      enabled: true
    },
    {
      eventType: 'issues.closed',
      channels: ['kc_dev'],
      template: 'smart_alert',
      enabled: true
    },

    // Security alerts - high priority notifications
    {
      eventType: 'pull_request.opened',
      conditions: {
        labels: ['security', 'vulnerability', 'critical']
      },
      channels: ['kc_dev'],
      template: 'security_alert',
      enabled: true
    },
    {
      eventType: 'issues.opened',
      conditions: {
        labels: ['security', 'vulnerability', 'critical']
      },
      channels: ['kc_dev'],
      template: 'security_alert',
      enabled: true
    },

    // UX/Design alerts
    {
      eventType: 'pull_request.opened',
      conditions: {
        labels: ['UX', 'design', 'ui', 'frontend']
      },
      channels: ['kc_dev'],
      template: 'design_alert',
      enabled: true
    },

    // Review requests
    {
      eventType: 'pull_request.review_requested',
      channels: ['kc_dev'],
      template: 'review_request',
      enabled: true
    },

    // Comments and mentions
    {
      eventType: 'issue_comment.created',
      channels: ['kc_dev'],
      template: 'mention_alert',
      enabled: true
    },

    // Activity pulse reports (scheduled)
    {
      eventType: 'activity_pulse.daily',
      channels: ['kc_dev'],
      template: 'activity_pulse',
      enabled: true
    },

    // Reviewer ping system (scheduled)
    {
      eventType: 'pull_request.review_stale',
      channels: ['kc_dev'],
      template: 'reviewer_ping',
      enabled: true
    },

    // Label-based routing rules (processed separately)
    {
      eventType: 'label_routing.*',
      channels: ['kc_dev'],
      template: 'label_based',
      enabled: true
    }
  ]
};

// Notification templates
export const notificationTemplates = {
  smart_alert: {
    pr_opened: (data: any) => `
🧩 <b>New PR Opened:</b> #${data.number} by @${data.author}
🗂️ <b>Title:</b> ${data.title}
📋 <b>Summary:</b> ${data.summary || 'No description provided'}
⏳ <b>Status:</b> ${data.status}
🔗 <a href="${data.url}">View PR</a>`,

    pr_closed: (data: any) => `
${data.merged ? '✅' : '❌'} <b>PR ${data.merged ? 'Merged' : 'Closed'}:</b> #${data.number} by @${data.author}
🗂️ <b>Title:</b> ${data.title}
${data.merged ? '🎉 <b>Successfully merged!</b>' : '📝 <b>Closed without merging</b>'}
🔗 <a href="${data.url}">View PR</a>`,

    issue_opened: (data: any) => `
🐛 <b>New Issue Opened:</b> #${data.number} by @${data.author}
🗂️ <b>Title:</b> ${data.title}
📋 <b>Description:</b> ${data.summary || 'No description provided'}
🏷️ <b>Labels:</b> ${data.labels?.join(', ') || 'None'}
🔗 <a href="${data.url}">View Issue</a>`,

    issue_closed: (data: any) => `
✅ <b>Issue Closed:</b> #${data.number} by @${data.author}
🗂️ <b>Title:</b> ${data.title}
🎯 <b>Resolved!</b>
🔗 <a href="${data.url}">View Issue</a>`
  },

  security_alert: {
    default: (data: any) => `
🚨 <b>SECURITY ALERT</b> 🚨
${data.type}: #${data.number} by @${data.author}
🗂️ <b>Title:</b> ${data.title}
🏷️ <b>Security Labels:</b> ${data.securityLabels?.join(', ')}
⚠️ <b>Requires immediate attention!</b>
🔗 <a href="${data.url}">View ${data.type}</a>`
  },

  design_alert: {
    default: (data: any) => `
🎨 <b>Design/UX Update:</b> #${data.number} by @${data.author}
🗂️ <b>Title:</b> ${data.title}
🏷️ <b>Design Labels:</b> ${data.designLabels?.join(', ')}
👀 <b>Design team review needed</b>
🔗 <a href="${data.url}">View PR</a>`
  },

  review_request: {
    default: (data: any) => `
👀 <b>Review Requested:</b> PR #${data.number}
🗂️ <b>Title:</b> ${data.title}
👤 <b>Author:</b> @${data.author}
🎯 <b>Reviewer:</b> ${data.reviewer}
🔗 <a href="${data.url}">Review Now</a>`
  },

  mention_alert: {
    default: (data: any) => `
📣 <b>${data.mentionedUser} was mentioned</b> in ${data.type} #${data.number}
👤 <b>By:</b> @${data.mentioner}
🧾 <b>Context:</b> "${data.context}"
${data.actionRequired ? '🎯 <b>Action needed!</b>' : ''}
🔗 <a href="${data.url}">View ${data.type}</a>`
  },

  reviewer_ping: {
    default: (data: any) => `
⏰ <b>PR #${data.number} waiting for review</b>
🗂️ <b>Title:</b> ${data.title}
⌛ <b>Waiting time:</b> ${data.waitTime}
👀 <b>Assigned reviewers:</b> ${data.reviewers?.join(', ')}
📎 <b>Let's unblock it!</b>
🔗 <a href="${data.url}">Review Now</a>`
  },

  activity_pulse: {
    daily: (data: any) => `
🧪 <b>GitHub Pulse — Last 24h</b>
📌 ${data.prsOpened} New PRs • ${data.prsMerged} Merged • ${data.issuesClosed} Issues Closed
👥 <b>Top Contributors:</b> ${data.topContributors?.join(', ')}
${data.highlight ? `🔥 <b>Highlight:</b> ${data.highlight}` : ''}`,

    weekly: (data: any) => `
📊 <b>Weekly GitHub Summary</b>
📈 <b>This Week:</b> ${data.prsOpened} PRs • ${data.prsMerged} Merged • ${data.issuesClosed} Issues Resolved
👑 <b>Top Contributors:</b> ${data.topContributors?.join(', ')}
🏆 <b>Achievement:</b> ${data.achievement || 'Great work team!'}
📅 <b>Next Week Goals:</b> Keep up the momentum!`
  },

  bug_alert: {
    default: (data: any) => `
🐛 <b>Bug Report${data.priorityText || ''}:</b> ${data.type} #${data.number}
🗂️ <b>Title:</b> ${data.title}
👤 <b>Author:</b> @${data.author}
🔥 <b>Needs prompt attention</b>
🔗 <a href="${data.url}">View ${data.type}</a>`
  },

  performance_alert: {
    default: (data: any) => `
⚡ <b>Performance Update${data.priorityText || ''}:</b> ${data.type} #${data.number}
🗂️ <b>Title:</b> ${data.title}
👤 <b>Author:</b> @${data.author}
📊 <b>Type:</b> Performance / Optimization
🚀 <b>Speed improvements incoming!</b>
🔗 <a href="${data.url}">View ${data.type}</a>`
  },

  docs_alert: {
    default: (data: any) => `
📚 <b>Documentation Update${data.priorityText || ''}:</b> ${data.type} #${data.number}
🗂️ <b>Title:</b> ${data.title}
👤 <b>Author:</b> @${data.author}
📖 <b>Type:</b> Documentation
✍️ <b>Knowledge base improvements</b>
🔗 <a href="${data.url}">View ${data.type}</a>`
  },

  infrastructure_alert: {
    default: (data: any) => `
🔧 <b>Infrastructure Update${data.priorityText || ''}:</b> ${data.type} #${data.number}
🗂️ <b>Title:</b> ${data.title}
👤 <b>Author:</b> @${data.author}
⚙️ <b>Type:</b> Infrastructure / DevOps
🏗️ <b>System improvements</b>
🔗 <a href="${data.url}">View ${data.type}</a>`
  }
};
