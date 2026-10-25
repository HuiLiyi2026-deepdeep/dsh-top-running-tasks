/**
 * dsh-top-running-tasks — host half.
 *
 * The plugin is entirely browser-side: its Client half injects a "running now"
 * section at the top of the sidebar's session list. The Host only needs this row
 * to exist so the composition loads `./client` (declared in package.json under
 * `dsh.client`); no Host Service, Event, or Config is contributed.
 */
export const name = 'dsh-top-running-tasks'

/** No Host capabilities are required. */
export const inject = []

/** Host half is a no-op. */
export function apply() {}
