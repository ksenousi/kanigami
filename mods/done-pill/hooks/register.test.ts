import { describe, expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const TOOL = 'mcp__done-pill__status'
const SURFACES = ['terminal', 'desktop'] as const

const band = (isWorking: boolean) => ({
  component: 'AbovePrompt' as const,
  // The band's scroll and view are the engine's; the pill reads neither.
  props: { hasSurvey: false, isWorking, maxRows: 10, bodyColumns: 100 } as never,
})

// Nothing stands for the engine beneath the plugin in a test, so each test
// answers the engine's side of the events the plugin passes on.
const engine = (on: On) => {
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('classic.Stop', () => ({}))
  on('prompt.compose', () => ({ sections: [{ id: 'base', text: 'You are Claude.', scope: 'shared' as const }] }))
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return h(Box, { key: 'engine' }) as never
  })
}

describe('done-pill', () => {
  test('shows nothing before the first turn ends', async ($, on) => {
    engine(on)
    for (const surface of SURFACES) {
      const ui = await $.ui.mount({ plugin: 'done-pill', surface, ...band(false) })
      expect(await ui.find({ type: 'Text', text: /Done|Needs you|Ended/ })).toBeUndefined()
      await ui.unmount()
    }
  })

  test('says Working while a turn runs', async ($, on) => {
    engine(on)
    for (const surface of SURFACES) {
      const ui = await $.ui.mount({ plugin: 'done-pill', surface, ...band(true) })
      expect(await ui.find({ type: 'Text', text: /Working/ })).toBeDefined()
      await ui.unmount()
    }
  })

  test('says Done when the turn declared nothing pending', async ($, on) => {
    engine(on)
    await $.turn.start({ text: 'fix it', turnId: 't1' })
    await $.tool.call({ tool: TOOL, state: 'done', reason: 'Pushed and deployed.' })
    await $.turn.complete({ answer: 'Done.', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
    for (const surface of SURFACES) {
      const ui = await $.ui.mount({ plugin: 'done-pill', surface, ...band(false) })
      expect(await ui.find({ type: 'Text', text: /Done · safe to close/ })).toBeDefined()
      await ui.unmount()
    }
  })

  test('says Needs you, with the reason, when a question is open', async ($, on) => {
    engine(on)
    await $.turn.start({ text: 'which?', turnId: 't2' })
    await $.tool.call({ tool: TOOL, state: 'needs-you', reason: 'Pick a density.' })
    await $.turn.complete({ answer: 'Which one?', durationMs: 1, isAborted: false, turnId: 't2', reason: 'answer' })
    const ui = await $.ui.mount({ plugin: 'done-pill', surface: 'desktop', ...band(false) })
    expect(await ui.find({ type: 'Text', text: /Needs you/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Pick a density/ })).toBeDefined()
  })

  test('never says Done for a turn that did not say so', async ($, on) => {
    engine(on)
    await $.turn.start({ text: 'go', turnId: 't3' })
    await $.turn.complete({ answer: 'Here.', durationMs: 1, isAborted: false, turnId: 't3', reason: 'answer' })
    const ui = await $.ui.mount({ plugin: 'done-pill', surface: 'desktop', ...band(false) })
    expect(await ui.find({ type: 'Text', text: /not confirmed done/ })).toBeDefined()
  })

  test('forgets the last turn’s verdict when a new turn starts', async ($, on) => {
    engine(on)
    await $.turn.start({ text: 'a', turnId: 't4' })
    await $.tool.call({ tool: TOOL, state: 'done', reason: 'All set.' })
    await $.turn.complete({ answer: 'ok', durationMs: 1, isAborted: false, turnId: 't4', reason: 'answer' })
    await $.turn.start({ text: 'b', turnId: 't5' })
    await $.turn.complete({ answer: 'ok', durationMs: 1, isAborted: false, turnId: 't5', reason: 'answer' })
    const ui = await $.ui.mount({ plugin: 'done-pill', surface: 'desktop', ...band(false) })
    expect(await ui.find({ type: 'Text', text: /not confirmed done/ })).toBeDefined()
  })

  test('says Stopped when the turn was interrupted', async ($, on) => {
    engine(on)
    await $.turn.start({ text: 'go', turnId: 't6' })
    await $.tool.call({ tool: TOOL, state: 'done', reason: 'x' })
    await $.turn.complete({ answer: '', durationMs: 1, isAborted: true, turnId: 't6', reason: 'aborted' })
    const ui = await $.ui.mount({ plugin: 'done-pill', surface: 'desktop', ...band(false) })
    expect(await ui.find({ type: 'Text', text: /Stopped/ })).toBeDefined()
  })

  test('refuses the first stop of a turn that said nothing, and lets the second go', async ($, on) => {
    engine(on)
    await $.turn.start({ text: 'go', turnId: 's1' })
    const first = await $.classic.Stop({ stop_hook_active: false, background_tasks: [] } as never)
    expect(first.block).toMatch(/call mcp__done-pill__status/)
    const second = await $.classic.Stop({ stop_hook_active: true, background_tasks: [] } as never)
    expect(second.block).toBeUndefined()
  })

  test('lets a turn stop once it has said', async ($, on) => {
    engine(on)
    await $.turn.start({ text: 'go', turnId: 's2' })
    await $.tool.call({ tool: TOOL, state: 'done', reason: 'All set.' })
    const stop = await $.classic.Stop({ stop_hook_active: false, background_tasks: [] } as never)
    expect(stop.block).toBeUndefined()
  })

  test('shows background work still running even when the turn said done', async ($, on) => {
    engine(on)
    await $.turn.start({ text: 'go', turnId: 's3' })
    await $.tool.call({ tool: TOOL, state: 'done', reason: 'All set.' })
    await $.classic.Stop({
      stop_hook_active: false,
      background_tasks: [{ id: 'b1', type: 'shell', status: 'running', description: 'npm run dev' }],
    } as never)
    await $.turn.complete({ answer: 'ok', durationMs: 1, isAborted: false, turnId: 's3', reason: 'answer' })
    const ui = await $.ui.mount({ plugin: 'done-pill', surface: 'desktop', ...band(false) })
    expect(await ui.find({ type: 'Text', text: /Running in the background/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /shell: npm run dev/ })).toBeDefined()
  })

  test('ignores background tasks that have already finished', async ($, on) => {
    engine(on)
    await $.turn.start({ text: 'go', turnId: 's4' })
    await $.tool.call({ tool: TOOL, state: 'done', reason: 'All set.' })
    await $.classic.Stop({
      stop_hook_active: false,
      background_tasks: [{ id: 'b2', type: 'shell', status: 'completed', description: 'npm test' }],
    } as never)
    await $.turn.complete({ answer: 'ok', durationMs: 1, isAborted: false, turnId: 's4', reason: 'answer' })
    const ui = await $.ui.mount({ plugin: 'done-pill', surface: 'desktop', ...band(false) })
    expect(await ui.find({ type: 'Text', text: /Done · safe to close/ })).toBeDefined()
  })

  test('does not count an artifact’s live-update watch as work still running', async ($, on) => {
    engine(on)
    await $.turn.start({ text: 'go', turnId: 's5' })
    await $.tool.call({ tool: TOOL, state: 'done', reason: 'All set.' })
    await $.classic.Stop({
      stop_hook_active: false,
      background_tasks: [
        { id: 'm1', type: 'monitor', status: 'running', description: 'live updates for artifact https://claude.ai/artifact/abc' },
      ],
    } as never)
    await $.turn.complete({ answer: 'ok', durationMs: 1, isAborted: false, turnId: 's5', reason: 'answer' })
    const ui = await $.ui.mount({ plugin: 'done-pill', surface: 'desktop', ...band(false) })
    expect(await ui.find({ type: 'Text', text: /Done · safe to close/ })).toBeDefined()
  })

  test('shows the TL;DR and ELI5 under the status once the turn has ended', async ($, on) => {
    engine(on)
    await $.turn.start({ text: 'go', turnId: 'x1' })
    await $.tool.call({
      tool: TOOL,
      state: 'done',
      reason: 'Pushed.',
      tldr: 'Ahead is two-up now.',
      eli5: 'The bottom part of the page got shorter.',
    })
    await $.turn.complete({ answer: 'ok', durationMs: 1, isAborted: false, turnId: 'x1', reason: 'answer' })
    for (const surface of SURFACES) {
      const ui = await $.ui.mount({ plugin: 'done-pill', surface, ...band(false) })
      expect(await ui.find({ type: 'Text', text: /TL;DR/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /Ahead is two-up now/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /The bottom part of the page got shorter/ })).toBeDefined()
      await ui.unmount()
    }
  })

  test('hides the last summary while a new turn runs', async ($, on) => {
    engine(on)
    await $.turn.start({ text: 'go', turnId: 'x2' })
    await $.tool.call({ tool: TOOL, state: 'done', reason: 'r', tldr: 'Old summary.', eli5: 'Old.' })
    await $.turn.complete({ answer: 'ok', durationMs: 1, isAborted: false, turnId: 'x2', reason: 'answer' })
    const ui = await $.ui.mount({ plugin: 'done-pill', surface: 'desktop', ...band(true) })
    expect(await ui.find({ type: 'Text', text: /Working/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Old summary/ })).toBeUndefined()
  })

  test('refuses a state it does not know', async ($, on) => {
    engine(on)
    const called = await $.tool.call({ tool: TOOL, state: 'maybe', reason: 'x' })
    expect(called.deny).toMatch(/state must be one of/)
  })

  test('adds its instruction to the system prompt', async ($, on) => {
    engine(on)
    const composed = await $.prompt.compose({
      model: 'claude-opus-5-5',
      promptModel: 'claude-opus-5-5',
      surfaces: ['desktop'],
      tools: [],
      outputStyle: { name: 'default', isKeepingCodingInstructions: true },
      traits: [],
    } as never)
    expect(composed.sections.some(s => s.id === 'done-pill' && s.text.includes(TOOL))).toBe(true)
  })
})
