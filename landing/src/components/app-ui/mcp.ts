/** MCP servers shown in the window shots (see McpLogo for their marks). */
export type McpId = 'paper' | 'supabase' | 'context7' | 'github' | 'linear';

export const MCP_NAMES: Record<McpId, string> = {
  paper: 'Paper',
  supabase: 'Supabase',
  context7: 'Context7',
  github: 'GitHub',
  linear: 'Linear',
};
