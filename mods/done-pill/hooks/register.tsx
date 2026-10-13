import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Pill, Verdict } from '../types'

// The pill: whether Claude is still working, finished with nothing pending,
// or finished but waiting on you — and under it, once a turn has ended, the
// reply in one line (TL;DR) and explained simply (ELI5). The engine knows when a turn is running;
// only Claude knows whether it left a question open, so it says so through
// the status tool as the last thing it does each turn. A turn that ends
// without saying is shown as unconfirmed, never as done.
//
// Enforced, not just asked: when Claude tries to end a turn without having
// said, the Stop is refused once with a reminder, so it says and then ends.
// And background work is not left to its word: the Stop carries the
// session's running tasks, and a turn that called itself done while any are
// still going is shown as running in the background.

const declared = atom({ plugin: 'done-pill', key: 'declared' } as const, null)
const pill = atom({ plugin: 'done-pill', key: 'pill' } as const, null)
const running = atom({ plugin: 'done-pill', key: 'running' } as const, [])

const TOOL = 'mcp__done-pill__status'
const STATES = ['done', 'needs-you', 'background'] as const

const INSTRUCTION = `# Status pill

The person cannot tell from the transcript alone whether you are finished, so a pill above their prompt shows it. In every turn where you reply to them, call ${TOOL} exactly once, just before your final message, then write that message and end the turn.

- state "done": everything they asked for is finished and checked, nothing you started is still running, and nothing waits on them. They can close the laptop.
- state "needs-you": you asked a question, offered options, need a decision, an approval or an action from them, or something failed or is left unresolved.
- state "background": work you started is still running (a background command, a subagent, a deploy you are watching) and you will report back when it ends.

reason: one short plain sentence saying what is done, or exactly what is pending. Be strict: if anything at all is open, it is not "done".

tldr: your final message in one line — the outcome, not the process.

eli5: the same explained simply, as to someone who has not followed the details: a sentence or two, no jargon, no file names.`

const LOOK: Record<Pill['kind'] | 'working', { label: string; color: 'claude' | 'success' | 'warning' | 'suggestion' | 'subtle' | 'inactive' }> = {
  working: { label: 'Working', color: 'claude' },
  done: { label: 'Done · safe to close', color: 'success' },
  'needs-you': { label: 'Needs you', color: 'warning' },
  background: { label: 'Running in the background', color: 'suggestion' },
  unconfirmed: { label: 'Ended · not confirmed done', color: 'subtle' },
  stopped: { label: 'Stopped', color: 'inactive' },
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.tool.register({
      name: 'status',
      description:
        'Report whether this turn leaves anything pending, for the status pill above the prompt. Call once per turn, just before the final message.',
      inputSchema: {
        type: 'object',
        properties: {
          state: { type: 'string', enum: [...STATES] },
          reason: { type: 'string', description: 'One short sentence: what is done, or what is pending.' },
          tldr: { type: 'string', description: 'The final message in one line: the outcome, not the process.' },
          eli5: { type: 'string', description: 'The same explained simply, in a sentence or two, no jargon.' },
        },
        required: ['state', 'reason', 'tldr', 'eli5'],
      },
      isDeferred: false,
    })
    return next(e)
  })

  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    return { ...composed, sections: [...composed.sections, { id: 'done-pill', text: INSTRUCTION, scope: 'session' }] }
  })

  on('tool.call', { tool: TOOL }, async ($, e) => {
    // A subagent's verdict is about its own errand, not the conversation.
    if (e.agentId) return { result: 'Ignored: only the main conversation sets the pill.' }
    const state = STATES.find(s => s === e.state)
    if (!state) return { deny: `state must be one of ${STATES.join(', ')}` }
    const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '')
    const verdict: Verdict = { state, reason: text(e.reason), tldr: text(e.tldr), eli5: text(e.eli5) }
    await update($, declared, () => verdict)
    return { result: 'Recorded.' }
  }).catch(() => ({ deny: 'done-pill could not record the status; say plainly in your message whether anything is pending.' }))

  on('turn.start', async ($, e, next) => {
    await update($, declared, () => null)
    await update($, running, () => [])
    return next(e)
  })

  // The main loop's Stop: refuse it once if nothing was reported, and note
  // what is still running either way.
  on('classic.Stop', async ($, e, next) => {
    // Only what is still going, named as the person would recognise it.
    const tasks = (e.background_tasks ?? [])
      .filter(t => t.status === 'running' || t.status === 'pending')
      // An artifact's live-update watch listens for edits for the rest of the
      // session and never finishes: it is not work anyone is waiting on.
      .filter(t => !(t.type === 'monitor' && /^live updates for artifact/i.test(t.description)))
      .map(t => `${t.type}: ${(t.description || t.command || t.agent_type || t.id).slice(0, 60)}`)
    await update($, running, () => tasks)
    if (!(await read($, declared)) && !e.stop_hook_active) {
      return { block: `Before ending the turn, call ${TOOL} with state and reason (done, needs-you or background), then end it.` }
    }
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const answered = await next(e)
    if (e.agentId) return answered
    const verdict = await read($, declared)
    let shown: Pill = e.isAborted
      ? { kind: 'stopped', reason: 'You stopped the turn.' }
      : e.reason !== 'answer'
        ? { kind: 'needs-you', reason: 'The turn ended on an error.' }
        : verdict
          ? { kind: verdict.state, reason: verdict.reason, tldr: verdict.tldr, eli5: verdict.eli5 }
          : { kind: 'unconfirmed', reason: 'Claude ended the turn without saying whether anything is pending.' }
    // Done is not done while something is still running.
    const tasks = await read($, running)
    if (shown.kind === 'done' && tasks.length > 0) {
      shown = { ...shown, kind: 'background', reason: `Said done, but still running: ${tasks.join(' · ')}` }
    }
    await update($, pill, () => shown)
    return answered
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const last = await read($, pill)
    const kind = e.props.isWorking ? 'working' : last?.kind
    if (!kind) return next(e)

    const { Box, Text } = $.ui.resolve(e)
    const look = LOOK[kind]
    // While a turn runs, the last one's summary would describe the wrong reply.
    const ended = kind === 'working' ? null : last
    const reason = ended?.reason ?? ''

    return (
      <Box flexDirection="column" gap={0}>
        <Text key="status" color={look.color} bold wrap="truncate-end">
          ● {look.label}
          {reason ? <Text dimColor bold={false}>{`  ${reason}`}</Text> : null}
        </Text>
        {ended?.tldr ? (
          <Text key="tldr" wrap="wrap">
            <Text bold>TL;DR </Text>
            {ended.tldr}
          </Text>
        ) : null}
        {ended?.eli5 ? (
          <Text key="eli5" wrap="wrap">
            <Text bold>ELI5 </Text>
            <Text dimColor>{ended.eli5}</Text>
          </Text>
        ) : null}
      </Box>
    )
  })
}
