import type { ReactNode } from 'react';

import { DOCS, DOCS_URL } from '@/lib/links';

/**
 * FAQ copy. The first answer is from the Paper design. The other answers are
 * written from the docs (website-docs/content/docs) and the LICENSE file.
 */
export const FAQ: { id: string; question: string; answer: ReactNode }[] = [
  {
    id: 'what',
    question: 'What is Troupe?',
    answer:
      'Troupe is a desktop app for AI coding agents. It puts Claude Code, Codex, Gemini CLI and other agents in one window, with tabs, git worktrees, a terminal, a canvas and automations around them.',
  },
  {
    id: 'free',
    question: 'Is Troupe free?',
    answer: (
      <>
        Yes. Troupe is free and open source under the MIT License. The desktop apps for macOS, Windows and Linux are on
        the GitHub releases page.
      </>
    ),
  },
  {
    id: 'subscriptions',
    question: 'Do I need my own agent subscriptions?',
    answer: (
      <>
        Yes. Troupe runs the agents that you install, with your own accounts. You can sign in to more than one Claude or
        Codex account, and Troupe offers to continue a chat on another account when one reaches its limit. See{' '}
        <a href={DOCS.agentSetup}>Agent setup</a>.
      </>
    ),
  },
  {
    id: 'code',
    question: 'Where does my code go?',
    answer: (
      <>
        Troupe runs on your computer and works in your local folders. The agents you use send your prompts and code
        to their own providers, as they do outside Troupe. When you share your desktop app with another device, the
        link goes through a Cloudflare tunnel (<code className="font-mono text-[0.9em]">cloudflared</code>). See the{' '}
        <a href={DOCS_URL}>docs</a>.
      </>
    ),
  },
  {
    id: 'phone',
    question: 'Can I use Troupe from my phone?',
    answer: (
      <>
        Yes. Turn on remote access in the desktop app and scan the QR code. Your live chats open on your phone, on any
        network, and you can approve a command from there. To keep Troupe available while your computer sleeps, run{' '}
        <code className="font-mono text-[0.9em]">troupe-server</code>. See <a href={DOCS.remote}>Browser and phone</a>.
      </>
    ),
  },
];
