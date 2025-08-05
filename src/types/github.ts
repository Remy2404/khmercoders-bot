// Types for GitHub webhook payloads

export interface GitHubUser {
  id: number;
  login: string;
  avatar_url: string;
  html_url: string;
}

export interface GitHubRepository {
  id: number;
  name: string;
  full_name: string;
  owner: GitHubUser;
  html_url: string;
  private: boolean;
}

export interface GitHubLabel {
  id: number;
  name: string;
  color: string;
  description?: string;
}

export interface GitHubPullRequest {
  id: number;
  number: number;
  title: string;
  body?: string;
  html_url: string;
  state: 'open' | 'closed';
  merged: boolean;
  draft: boolean;
  user: GitHubUser;
  created_at: string;
  updated_at: string;
  closed_at?: string;
  merged_at?: string;
  requested_reviewers: GitHubUser[];
  labels: GitHubLabel[];
  head: {
    ref: string;
    sha: string;
  };
  base: {
    ref: string;
    sha: string;
  };
}

export interface GitHubIssue {
  id: number;
  number: number;
  title: string;
  body?: string;
  html_url: string;
  state: 'open' | 'closed';
  user: GitHubUser;
  assignees: GitHubUser[];
  labels: GitHubLabel[];
  created_at: string;
  updated_at: string;
  closed_at?: string;
}

export interface GitHubComment {
  id: number;
  user: GitHubUser;
  body: string;
  html_url: string;
  created_at: string;
  updated_at: string;
}

// Webhook event payloads
export interface GitHubPullRequestWebhook {
  action: 'opened' | 'closed' | 'reopened' | 'synchronize' | 'review_requested' | 'review_request_removed';
  number: number;
  pull_request: GitHubPullRequest;
  repository: GitHubRepository;
  sender: GitHubUser;
  requested_reviewer?: GitHubUser;
}

export interface GitHubIssuesWebhook {
  action: 'opened' | 'closed' | 'reopened' | 'assigned' | 'unassigned' | 'labeled' | 'unlabeled';
  issue: GitHubIssue;
  repository: GitHubRepository;
  sender: GitHubUser;
  assignee?: GitHubUser;
  label?: GitHubLabel;
}

export interface GitHubIssueCommentWebhook {
  action: 'created' | 'edited' | 'deleted';
  issue: GitHubIssue;
  comment: GitHubComment;
  repository: GitHubRepository;
  sender: GitHubUser;
}

export interface GitHubPushWebhook {
  ref: string; // branch reference like "refs/heads/main"
  before: string; // previous commit SHA
  after: string; // new commit SHA
  created: boolean;
  deleted: boolean;
  forced: boolean;
  commits: {
    id: string;
    message: string;
    author: {
      name: string;
      email: string;
      username?: string;
    };
    url: string;
    added: string[];
    removed: string[];
    modified: string[];
  }[];
  head_commit: {
    id: string;
    message: string;
    author: {
      name: string;
      email: string;
      username?: string;
    };
    url: string;
  } | null;
  repository: GitHubRepository;
  pusher: {
    name: string;
    email: string;
  };
  sender: GitHubUser;
}

export interface GitHubPullRequestReviewWebhook {
  action: 'submitted' | 'edited' | 'dismissed';
  pull_request: GitHubPullRequest;
  review: {
    id: number;
    user: GitHubUser;
    body: string;
    state: 'approved' | 'changes_requested' | 'commented';
    html_url: string;
    submitted_at: string;
  };
  repository: GitHubRepository;
  sender: GitHubUser;
}

// Union type for all webhook events
export type GitHubWebhookPayload = 
  | GitHubPullRequestWebhook
  | GitHubIssuesWebhook  
  | GitHubIssueCommentWebhook
  | GitHubPullRequestReviewWebhook
  | GitHubPushWebhook;

// Notification configuration types
export interface NotificationRule {
  eventType: string;
  conditions?: {
    labels?: string[];
    authors?: string[];
    branches?: string[];
  };
  channels: string[];
  template: string;
  enabled: boolean;
}

export interface NotificationConfig {
  rules: NotificationRule[];
  channels: {
    [key: string]: {
      chatId: string;
      name: string;
      type: 'group' | 'channel' | 'private';
    };
  };
  mentions: {
    [githubUsername: string]: string; // Map GitHub username to Telegram username
  };
}
