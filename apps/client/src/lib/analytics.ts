export type AnalyticsEventName =
  | 'end_flow_started'
  | 'end_flow_step_viewed'
  | 'end_flow_continue_clicked'
  | 'chest_open_clicked'
  | 'chest_open_succeeded'
  | 'chest_open_failed'
  | 'reward_result_continue_clicked'
  | 'summary_play_again_clicked'
  | 'summary_back_to_lobby_clicked'
  | 'action_log_download_clicked'
  | 'leaderboard_view_clicked';

export function trackEvent(
  name: AnalyticsEventName,
  props: Record<string, unknown> = {}
) {
  // Best-effort: if posthog exists, use it; otherwise log in dev.
  try {
    const w = window as any;
    if (w?.posthog?.capture) {
      w.posthog.capture(name, props);
      return;
    }
  } catch {
    // ignore
  }

  if (process.env.NODE_ENV !== 'production') {
    // eslint-disable-next-line no-console
    console.debug('[analytics]', name, props);
  }
}
