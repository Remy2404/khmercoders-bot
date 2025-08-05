-- Migration file for GitHub notification tracking
-- Create github_notifications table for tracking sent notifications
CREATE TABLE github_notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type TEXT NOT NULL,              -- 'pull_request', 'issues', 'mention', etc.
    github_id TEXT NOT NULL,               -- GitHub PR/issue ID
    notification_type TEXT NOT NULL,       -- 'smart_alert', 'mention', 'pulse', 'reviewer_ping', 'label_route'
    chat_id TEXT NOT NULL,                 -- Telegram chat ID where notification was sent
    sent_at TEXT NOT NULL,                 -- ISO timestamp when notification was sent
    data_hash TEXT,                        -- Hash of notification content to prevent duplicates
    UNIQUE(event_type, github_id, notification_type, data_hash)
);

-- Create github_pr_tracking table for monitoring PR states
CREATE TABLE github_pr_tracking (
    pr_number INTEGER PRIMARY KEY,
    repository TEXT NOT NULL,              -- 'owner/repo' format
    author TEXT NOT NULL,                  -- GitHub username
    title TEXT NOT NULL,
    state TEXT NOT NULL,                   -- 'open', 'closed', 'merged'
    created_at TEXT NOT NULL,              -- ISO timestamp
    updated_at TEXT NOT NULL,              -- ISO timestamp
    reviewers TEXT,                        -- JSON array of reviewer usernames
    labels TEXT,                           -- JSON array of label names
    last_activity_at TEXT NOT NULL,        -- Last comment/review/commit timestamp
    review_requested_at TEXT               -- When review was first requested
);

-- Create github_mentions table for tracking @mentions
CREATE TABLE github_mentions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    github_id TEXT NOT NULL,               -- PR/issue ID
    mentioned_user TEXT NOT NULL,          -- GitHub username mentioned
    mentioner TEXT NOT NULL,               -- Who did the mentioning
    context TEXT NOT NULL,                 -- Surrounding text of the mention
    acknowledged BOOLEAN DEFAULT FALSE,    -- Whether mention was acknowledged
    created_at TEXT NOT NULL,              -- ISO timestamp
    UNIQUE(github_id, mentioned_user, context)
);

-- Create activity_pulse table for tracking daily/weekly summaries
CREATE TABLE activity_pulse (
    date TEXT PRIMARY KEY,                 -- YYYY-MM-DD format
    period_type TEXT NOT NULL,             -- 'daily', 'weekly'
    prs_opened INTEGER DEFAULT 0,
    prs_merged INTEGER DEFAULT 0,
    prs_closed INTEGER DEFAULT 0,
    issues_opened INTEGER DEFAULT 0,
    issues_closed INTEGER DEFAULT 0,
    total_contributors INTEGER DEFAULT 0,
    top_contributors TEXT,                 -- JSON array of top contributors
    last_sent_at TEXT                      -- When summary was last sent
);

-- Create rate_limits table for preventing webhook spam
CREATE TABLE rate_limits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type TEXT NOT NULL,
    identifier TEXT NOT NULL,
    created_at TEXT NOT NULL
);

-- Create indexes for faster lookups
CREATE INDEX idx_github_notifications_event ON github_notifications (event_type, github_id);
CREATE INDEX idx_github_notifications_sent ON github_notifications (sent_at);
CREATE INDEX idx_pr_tracking_state ON github_pr_tracking (state, last_activity_at);
CREATE INDEX idx_pr_tracking_reviewers ON github_pr_tracking (reviewers);
CREATE INDEX idx_mentions_user ON github_mentions (mentioned_user, acknowledged);
CREATE INDEX idx_activity_pulse_date ON activity_pulse (date, period_type);
CREATE INDEX idx_rate_limits_event ON rate_limits (event_type, identifier, created_at);
