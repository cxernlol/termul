import antigravity from '@/assets/agents/antigravity.svg?raw';
import claudeCode from '@/assets/agents/claude-code.svg?raw';
import codex from '@/assets/agents/codex.svg?raw';
import cursor from '@/assets/agents/cursor.svg?raw';
import geminiCli from '@/assets/agents/gemini-cli.svg?raw';
import opencode from '@/assets/agents/opencode.svg?raw';

/**
 * Agent marks copied from the app (src/renderer/assets/agent-icons). They use
 * `currentColor`; the brand colors below match the Paper design.
 */
export const AGENTS = {
  'claude-code': { name: 'Claude Code', svg: claudeCode, color: '#D97757' },
  codex: { name: 'Codex', svg: codex, color: 'oklch(78% 0.003 248)' },
  'gemini-cli': { name: 'Gemini CLI', svg: geminiCli, color: '#9177C7' },
  opencode: { name: 'OpenCode', svg: opencode, color: 'oklch(78% 0.003 248)' },
  cursor: { name: 'Cursor', svg: cursor, color: 'oklch(78% 0.003 248)' },
  // Official mark from antigravity.google (favicon.svg, without its background
  // circle). Antigravity is in the ACP registry the app ships
  // (src/renderer/assets/agent-icons/acp/agents.json, "antigravity-acp").
  antigravity: { name: 'Antigravity', svg: antigravity, color: 'currentColor' },
} as const;

export type AgentId = keyof typeof AGENTS;
