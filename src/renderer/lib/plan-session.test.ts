import { describe, expect, it } from 'vitest'
import type { PlanEntry } from '@/lib/acp-api'
import {
  classifyFullPlan,
  foldRecoveredPlan,
  isNewPlanList,
  isPlanToolCall,
  isSettledPlan,
  planEventHasList,
  plansAfterToolCall,
  resolvePlanToolCall,
  settleRunningPlan,
  stripTermulPlanFences
} from '@/lib/plan-session'

const current: PlanEntry[] = [
  { id: 'a', content: 'Read', status: 'pending', priority: 'high' },
  { id: 'b', content: 'Edit', status: 'in_progress', priority: 'medium' }
]

describe('plan session rules', () => {
  it('classifies a full ACP list by overlap', () => {
    expect(classifyFullPlan(undefined, [{ content: 'One' }])).toBe('new')
    expect(classifyFullPlan(current, [{ content: 'Read', status: 'completed' }])).toBe('update')
    expect(classifyFullPlan(current, [{ content: 'Something else' }])).toBe('new')
    expect(classifyFullPlan(current, [])).toBe('clear')
    expect(isNewPlanList(['content:Read'], ['content:Read', 'content:Edit'])).toBe(false)
    expect(isNewPlanList(['id:a'], ['id:b'])).toBe(true)
  })

  it('merges TodoWrite by id and replaces when merge is false', () => {
    const merged = resolvePlanToolCall(current, {
      title: 'TodoWrite',
      status: 'completed',
      rawInput: { merge: true, todos: [{ id: 'a', status: 'completed', content: 'Read' }] }
    })
    expect(merged).toEqual({
      kind: 'update',
      entries: [
        { id: 'a', content: 'Read', status: 'completed', priority: 'high' },
        { id: 'b', content: 'Edit', status: 'in_progress', priority: 'medium' }
      ]
    })

    const replaced = resolvePlanToolCall(current, {
      _meta: { claudeCode: { toolName: 'TodoWrite' } },
      status: 'completed',
      rawInput: { merge: false, todos: [{ id: 'c', content: 'Ship', status: 'pending' }] }
    })
    expect(replaced?.kind).toBe('new')
    expect(replaced?.entries).toEqual([{ id: 'c', content: 'Ship', status: 'pending' }])
  })

  it('treats Codex update_plan and the host plan tool as full lists', () => {
    const codex = resolvePlanToolCall(current, {
      title: 'update_plan',
      status: 'completed',
      rawInput: {
        plan: [
          { step: 'Read', status: 'completed' },
          { step: 'Test', status: 'in_progress' }
        ]
      }
    })
    expect(codex?.kind).toBe('update')
    expect(codex?.entries.map((entry) => entry.content)).toEqual(['Read', 'Test'])

    const host = resolvePlanToolCall(undefined, {
      title: 'mcp__troupe__plan',
      status: 'in_progress',
      rawInput: { todos: [{ content: 'Investigate', status: 'in_progress', priority: 'high' }] }
    })
    expect(host?.kind).toBe('new')
    expect(host?.entries).toEqual([
      { content: 'Investigate', status: 'in_progress', priority: 'high' }
    ])
  })

  it('does not clear the plan from an empty in-flight call', () => {
    expect(
      resolvePlanToolCall(current, {
        title: 'plan',
        status: 'in_progress',
        rawInput: { todos: [] }
      })
    ).toBeNull()
    const cleared = plansAfterToolCall({ s: current }, 's', {
      title: 'updateTodos',
      status: 'completed',
      rawInput: { merge: false, todos: [] }
    })
    expect(cleared).toEqual({ plans: {}, kind: 'clear' })
  })

  it('recognizes plan tools and ignores ordinary tools', () => {
    expect(isPlanToolCall({ title: 'TodoWrite' })).toBe(true)
    expect(isPlanToolCall({ title: 'update_todos' })).toBe(true)
    expect(isPlanToolCall({ rawInput: { _toolName: 'updateTodos' } })).toBe(true)
    expect(isPlanToolCall({ planTool: true })).toBe(true)
    expect(isPlanToolCall({ title: 'Read Plan.md' })).toBe(false)
    expect(isPlanToolCall({ title: 'plan the migration' })).toBe(false)
  })

  it('settles running items and treats cancelled as finished', () => {
    const settled = settleRunningPlan([
      { content: 'Done', status: 'completed' },
      { content: 'Run', status: 'in_progress' },
      { content: 'Skip', status: 'cancelled' }
    ])
    expect(settled).toEqual([
      { content: 'Done', status: 'completed' },
      { content: 'Run', status: 'pending' },
      { content: 'Skip', status: 'cancelled' }
    ])
    expect(settleRunningPlan(settled)).toBe(settled)
    expect(isSettledPlan(settled ?? [])).toBe(false)
    expect(
      isSettledPlan([
        { content: 'Done', status: 'completed' },
        { content: 'Skip', status: 'cancelled' }
      ])
    ).toBe(true)
  })

  it('ignores a status-only tool event and replays a recovered plan', () => {
    expect(planEventHasList({ title: 'TodoWrite', status: 'completed' })).toBe(false)
    expect(
      planEventHasList({
        title: 'TodoWrite',
        rawInput: { todos: [{ content: 'Ship', status: 'pending' }] }
      })
    ).toBe(true)

    const folded = foldRecoveredPlan([
      {
        type: 'plan_update',
        payload: {
          plan: {
            entries: [
              { content: 'Read', status: 'completed' },
              { content: 'Edit', status: 'in_progress' }
            ]
          }
        }
      },
      {
        type: 'tool_call_update',
        payload: { update: { toolCallId: 'a', status: 'completed', title: 'TodoWrite' } }
      },
      { type: 'prompt_complete', payload: { stopReason: 'end_turn' } }
    ])
    expect(folded).toEqual([
      { content: 'Read', status: 'completed' },
      { content: 'Edit', status: 'pending' }
    ])
  })

  it('strips a plan fence from display text and leaves prose', () => {
    const fence = '```termul-plan\n[{"content":"Ship"}]\n```'
    expect(stripTermulPlanFences(`Done.\n${fence}`)).toBe('Done.\n')
    expect(stripTermulPlanFences(fence)).toBe('')
    expect(stripTermulPlanFences('no plan here')).toBe('no plan here')
    expect(stripTermulPlanFences('see ```termul-plan-v2 notes```')).toBe(
      'see ```termul-plan-v2 notes```'
    )
  })
})
