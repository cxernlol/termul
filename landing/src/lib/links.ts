export const GITHUB_REPO_URL = 'https://github.com/gnoviawan/troupe';
export const RELEASES_PAGE_URL = `${GITHUB_REPO_URL}/releases`;
export const LATEST_RELEASE_URL = `${GITHUB_REPO_URL}/releases/latest`;
export const ISSUES_URL = `${GITHUB_REPO_URL}/issues`;
export const PULLS_URL = `${GITHUB_REPO_URL}/pulls`;
export const CONTRIBUTING_URL = `${GITHUB_REPO_URL}/blob/dev/CONTRIBUTING.md`;
export const LICENSE_URL = `${GITHUB_REPO_URL}/blob/dev/LICENSE`;

/** The docs site is served on the same domain (website-docs, merged at deploy). */
export const DOCS_URL = '/docs/';
export const DOCS = {
  gettingStarted: '/docs/getting-started',
  agentSetup: '/docs/agent-setup',
  remote: '/docs/remote',
  serverApi: '/docs/server-api',
} as const;

/** There is no changelog page in the docs; GitHub Releases has the notes. */
export const CHANGELOG_URL = RELEASES_PAGE_URL;

/** Page sections. */
export const SECTION = {
  tour: 'tour',
  agents: 'agents',
} as const;

/** The download link that "Send to my Mac" and "Copy link" share. */
export const DOWNLOAD_PAGE_URL = 'https://usetroupe.dev/#download';
