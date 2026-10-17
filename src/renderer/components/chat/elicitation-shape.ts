import type { ElicitationField } from '@/lib/acp-api'

export interface QuestionShape {
  /** Titled `enum`/`multi-enum` fields, in the agent's order. */
  questions: ElicitationField[]
  /**
   * Question field name -> name of its free-text companion field. Agents that
   * cannot set `cognition.ai/allowOther` (claude-agent-acp) follow each
   * question with an optional string field named `<question>_custom`.
   */
  customFor: Record<string, string>
}

const CUSTOM_SUFFIX = '_custom'

function isTitledQuestion(field: ElicitationField): boolean {
  return (field.kind === 'enum' || field.kind === 'multi-enum') && Boolean(field.title?.trim())
}

/**
 * Split an elicitation form into question fields plus their per-question
 * `<name>_custom` free-text companions. Returns `null` when the form is not an
 * `ask_user_question` batch (any other field stays on the generic form).
 */
export function questionShape(fields: ElicitationField[]): QuestionShape | null {
  const questionNames = new Set(fields.filter(isTitledQuestion).map((field) => field.name))
  const questions: ElicitationField[] = []
  const customFor: Record<string, string> = {}
  for (const field of fields) {
    if (isTitledQuestion(field)) {
      questions.push(field)
      continue
    }
    const owner = field.name.endsWith(CUSTOM_SUFFIX)
      ? field.name.slice(0, -CUSTOM_SUFFIX.length)
      : ''
    if (field.kind === 'string' && !field.required && owner && questionNames.has(owner)) {
      customFor[owner] = field.name
      continue
    }
    return null
  }
  return questions.length > 0 ? { questions, customFor } : null
}
