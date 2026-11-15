# ACP Agent Plan Compliance

**Date:** 2026-07-17  
**Spec:** [Agent Plan](https://agentclientprotocol.com/protocol/v1/agent-plan)

## Troupe client behavior

Troupe shows one execution plan per session, in the sticky panel:

- Agent sends `session/update` with `sessionUpdate: "plan"`
- Payload includes `entries[]` with `content`, `priority` (`high`|`medium`|`low`), `status` (`pending`|`in_progress`|`completed`)
- Each update is a **full replace** — the client keeps one plan per session
- Empty `entries: []` hides `PlanPanel`
- The plan renders only in the sticky `PlanPanel`. It is never a card in the chat transcript.

## One plan, and how a new plan differs from an update

Troupe keeps a single list in `plans[sessionId]`. A later list replaces that one. Historical turns do not each keep their own visible plan.

ACP `session/update` `plan`, the host `plan` tool, and Codex `update_plan` all send the **whole list**. They have no merge flag.

| Incoming list | Result |
| --- | --- |
| Empty | The plan is cleared and the panel hides. |
| No current plan, or no shared entry with the current plan | A **new plan**. The list is replaced and the panel opens. |
| Shares an entry (same `id`, or the same text when an id is missing on one side) | An **in-place update**. The stored list becomes the incoming full list. The panel keeps its open or closed state. |

Claude Code `TodoWrite` and Cursor `updateTodos` / `update_todos` also send `merge`:

| `merge` | Result |
| --- | --- |
| `false` or omitted | The array replaces the list. The overlap rule above decides new vs update. |
| `true` | Items merge by `id` (or by text when there is no id). Items missing from the call stay. An empty merge changes nothing. |

A plan/todo tool call (`plan`, `TodoWrite`, `todo_write`, `update_plan`, `updateTodos`, `update_todos`, including an MCP name whose leaf is one of those) does not render as a transcript card. The host `plan` tool still emits `acp:plan_update`; applying the same list twice is the same plan.

When every item is `completed` or `cancelled`, the panel closes. The header stays, and a tap opens it. A new plan opens it again.

When a turn ends for any reason (`end_turn`, `cancelled`, `error`, `timeout`, `crashed`, or any other stop reason), `in_progress` items return to `pending`. The same settle runs when a finished chat is reopened, so a spinner cannot survive the turn. A turn that is still running keeps `in_progress`.

The `termul-plan` fence on the assistant message is only the restore copy for the panel. It is stripped from the rendered reply and from copied text.

A vendor **tool call** named above is folded into the same plan. A custom session extension that is not a tool call and not `sessionUpdate: "plan"` (for example Cursor `cursor/update_todos` when it is not delivered as `updateTodos`) still does not appear.

Implementation:

| Layer | Path |
|-------|------|
| Rust | `SessionUpdate::Plan` → `acp:plan_update` (`src-tauri/src/acp/client.rs`) |
| Store | `plans[sessionId]`, one list (`src/renderer/lib/plan-session.ts`, `src/renderer/stores/acp-store/`) |
| UI | Sticky `PlanPanel` only (`src/renderer/components/chat/PlanPanel.tsx`) |

Compliance metadata: `src/renderer/lib/agents/acp-plan-compliance.ts`

## Registry audit (37 bundled agents)

Status key:

| Status | Meaning |
|--------|---------|
| `unknown` | Not verified; plan may appear if agent emits standard updates |
| `standard` | Verified standard `session/update` plan |
| `non_standard_extension` | Known to use a non-spec extension instead of plan |
| `unsupported` | Documented: adapter does not emit plans |

### Verified / documented

| Registry id | Status | Notes |
|-------------|--------|-------|
| `cursor` | `non_standard_extension` | Uses `cursor/update_todos`, not spec plan. PlanPanel empty until Cursor CLI emits standard plan. |
| `pi-acp` | `unsupported` | [pi-acp docs](https://github.com/victor-software-house/pi-acp): plan updates not emitted before tool execution. |

### Test targets (user environment)

| Registry id | Status | Notes |
|-------------|--------|-------|
| `opencode` | `unknown` | ACP transport present; plan emission not verified in Troupe. Multi-step prompts should be re-tested after agent-side compliance. |

### All other bundled agents (`unknown`)

`agoragentic-acp`, `amp-acp`, `auggie`, `autohand`, `claude-acp`, `cline`, `codebuddy-code`, `codex-acp`, `cortex-code`, `corust-agent`, `crow-cli`, `deepagents`, `devin`, `dimcode`, `dirac`, `factory-droid`, `fast-agent`, `gemini`, `github-copilot-cli`, `glm-acp-agent`, `goose`, `grok-build`, `junie`, `kilo`, `kimi`, `minion-code`, `mistral-vibe`, `nova`, `poolside`, `qoder`, `qwen-code`, `sigit`, `stakpak`, `vtcode`

Update `KNOWN_COMPLIANCE` in `acp-plan-compliance.ts` when an agent is verified.

## Acceptance scenario

1. Open an agent chat session for an agent with `standard` compliance (once verified).
2. Send a multi-step prompt.
3. `PlanPanel` shows entries with `pending` / `in_progress` / `completed` as the agent emits standard plan updates.
4. Agents marked `non_standard_extension` or `unsupported` show `PlanSupportHint` instead when no plan is present.

## Agent vendor guidance

To support execution plans in Troupe (and any spec-compliant ACP client):

1. Emit `session/update` notifications with `sessionUpdate: "plan"`.
2. Include the **complete** entry list on every update.
3. Do not rely on client-specific extensions for plan visibility.

Reference: https://agentclientprotocol.com/protocol/v1/agent-plan
