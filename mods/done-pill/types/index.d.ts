/** What Claude said at the end of its turn, through the status tool. */
export type Verdict = {
  state: 'done' | 'needs-you' | 'background'
  reason: string
  /** The reply in one line. */
  tldr: string
  /** The reply explained simply, in a sentence or two. */
  eli5: string
}

/** What the pill shows once a turn has ended. */
export type Pill = {
  kind: 'done' | 'needs-you' | 'background' | 'unconfirmed' | 'stopped'
  reason: string
  tldr?: string
  eli5?: string
}

declare module 'claude-code' {
  interface PluginState {
    'done-pill': {
      /** This turn's verdict so far, cleared when a turn starts. */
      declared: Verdict | null
      /** The last finished turn's pill; null before the first turn ends. */
      pill: Pill | null
      /** Background work still running when the turn last tried to stop. */
      running: string[]
    }
  }
}
