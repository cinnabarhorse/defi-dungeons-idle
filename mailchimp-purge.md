### Mailchimp purge plan — remove never-openers from audience

#### Objective

- Identify audience contacts who have never engaged (opened/clicked) with any of your emails and remove them from the audience to improve deliverability and reduce costs.
- Provide a safe, auditable process with a dry-run phase and explicit exclusions.

#### Finalized decisions

- Audience: `aavegotchi` audience (we will need the Mailchimp Audience ID to set `MAILCHIMP_LIST_ID`).
- Engagement definition: “Never opened any email” (all-time), counting opens from automations/journeys as engagement.
- Exclusions: None.
- Deletion mode: Archive only (no permanent deletions).
- Output: CSV (JSON optional via flag, off by default).
- Scheduling: One-off run.
- Volume expectations: ~7,000 contacts; assume ~50% candidates. Plan for concurrency 4–5 with adaptive backoff.

### High-level approach

There are two practical strategies; we’ll default to Strategy B for accuracy and efficiency.

- Strategy A (per-member activity lookup): For each subscribed member, fetch `GET /lists/{list_id}/members/{subscriber_hash}/activity` and check for any “open” events. Pros: simple; Cons: 1 request per member, capped history (last 50 events), higher rate-limit pressure, potential false negatives for very old opens.
- Strategy B (aggregate openers across all campaigns): Iterate all relevant campaigns, fetch opener details for each (`GET /reports/{campaign_id}/open-details` or `GET /reports/{campaign_id}/email-activity`), build a set of “ever-opened” subscriber hashes, then compare against current subscribed members. Pros: fewer per-member calls, captures historical opens per campaign; Cons: must enumerate campaigns (and automations if included).

We will implement Strategy B and optionally fall back to member activity for edge verification on candidates during dry-run.

Implementation note: To ensure automations/journeys are included, we will iterate via Reports-first (`GET /reports`) to enumerate all sent email reports (regular + automations/journeys) and then fetch opener details per campaign from those reports.

### Scope and filters

- Audience/list: `aavegotchi` audience identified by `list_id` (required).
- Member statuses: consider only `subscribed`. Exclude `unsubscribed`, `cleaned`, `pending`, `transactional`.
- Engagement signals: “opened at least once” across all time, including opens from automations/journeys (no timeframe/window).
- Exclusions: none.

### API surface (Mailchimp Marketing API v3.0)

- Reports (primary enumeration, includes regular campaigns and automations/journeys)
  - List reports: `GET /reports` (paginate; filter client-side by `list_id` when present on the report object).
  - Open details per campaign: `GET /reports/{campaign_id}/open-details`.
  - Email activity (optional verification or to include clicks): `GET /reports/{campaign_id}/email-activity`.
- Campaigns
  - List campaigns: `GET /campaigns` (filter by `status=sent`, `list_id`, `since_send_time`, etc.).
  - Open details: `GET /reports/{campaign_id}/open-details` (paginated list of recipients who opened; includes open counts/timestamps).
  - Email activity: `GET /reports/{campaign_id}/email-activity` (action sequences per recipient, including opens/clicks; larger payloads).
- Lists (Audiences)
  - List members: `GET /lists/{list_id}/members` (paginate; filter by `status=subscribed`).
  - Member activity (optional verification): `GET /lists/{list_id}/members/{subscriber_hash}/activity` (last 50 events).
  - Archive member: `DELETE /lists/{list_id}/members/{subscriber_hash}` (archive; reversible by resubscribe).
  - Permanent delete (irreversible): `POST /lists/{list_id}/members/{subscriber_hash}/actions/delete-permanent`.
- Batching (optional): `POST /batches` to submit many operations efficiently within rate limits.

### Data model and identity

- Normalize email to lowercase; compute `subscriber_hash = md5(lowercase(email))` to match Mailchimp’s requirement.
- Build sets keyed by `subscriber_hash` for O(1) membership checks:
  - `everOpenedSet`: built from union of openers across all considered campaigns.
  - `subscribedMembers`: page through list members with `status=subscribed`.
- Candidates for purge = `subscribedMembers` − `everOpenedSet`, minus any excluded members (tags, recency, etc.).

### Safety, compliance, and auditability

- Dry-run first: produce CSV/JSON with candidates; include email, subscriber_hash, tags, status, signup_date, last_engagement_timestamp (if known), reasons matched.
- Archive by default: safer than permanent delete; preserves reporting history. Only allow permanent delete with explicit flag.
- Logging: structured JSON logs per action (dry-run and apply), plus a summary report.
- Backpressure: respect Mailchimp’s rate limits (≈10 req/s). Use bounded concurrency and automatic retry with exponential backoff (429, 5xx).
- Idempotency: write a run artifact (timestamped) to allow re-runs without double-processing.

### Implementation outline (no code yet; tailored to your decisions)

1. Configuration
   - Environment variables: `MAILCHIMP_API_KEY`, `MAILCHIMP_DC` (server prefix, e.g., `us21`), `MAILCHIMP_LIST_ID` (for `aavegotchi`).
   - CLI flags (minimal, sensible defaults for this one-off run):
     - `--list-id` (optional override; default: `MAILCHIMP_LIST_ID`)
     - `--dry-run` (default true)
     - `--json` (also write JSON alongside CSV; default false)
     - `--concurrency N` (default 4)

2. Discover reports
   - Page through `GET /reports` (no timeframe) and keep only reports with `list_id === MAILCHIMP_LIST_ID`.
   - This covers regular campaigns and automations/journeys (each automated email has a campaign/report).

3. Build “ever opened” set
   - For each report’s `campaign_id`, page through `GET /reports/{campaign_id}/open-details` to collect all openers.
   - Store `subscriber_hash` (or normalized email) in `everOpenedSet`.

4. Enumerate subscribed members
   - Page through `GET /lists/{list_id}/members?status=subscribed` (max 1000/page).
   - Apply no exclusions (per decision).

5. Determine candidates
   - Candidate if `subscriber_hash` NOT in `everOpenedSet` (never opened, all-time).
   - Optional verification: fetch `member activity` for a small sample during dry-run to sanity-check coverage.

6. Dry-run output
   - Emit CSV artifact: `mailchimp-purge/dry-run-{timestamp}.csv` (JSON optional via `--json`).
   - Include counts by reason (here: `no_opens_all_time`) in a summary.

7. Apply (archive by default)
   - Archive via `DELETE /lists/{list_id}/members/{subscriber_hash}` with bounded concurrency and retries.
   - Optionally use `POST /batches` for bulk operations when candidate count is large.
   - Permanent delete path will not be exposed for this run.

8. Reporting
   - Final summary: total members scanned, campaigns considered, ever-opened count, candidate count, archived count, error count.
   - Save an audit log in `mailchimp-purge/run-{timestamp}.json` with per-member actions.

### Rate limiting and resilience

- Concurrency: start with 3–5 concurrent requests, adapt down on 429 responses.
- Retries: exponential backoff (jitter), max attempts 5 for 429/5xx.
- Pagination: use `count` and `offset` (or `page`) consistently; log cursors for resume on interruption.

### Testing and rollout

- Phase 1: Dry-run on a single small audience or a saved segment (or time-bounded set of campaigns).
- Phase 2: Validate the candidate CSV; spot-check a few emails in Mailchimp UI.
- Phase 3: Archive a tiny batch (e.g., 20) and confirm expected results in UI.
- Phase 4: Full apply with monitoring.
- Post-run: export results and share a quick deliverability re-baseline plan.

### Deliverables

- `scripts/mailchimp-purge.ts` (TypeScript script run with tsx), not yet implemented.
- `mailchimp-purge/` artifacts directory for dry-run/apply outputs.
- README block in the script header describing flags and safety notes.

### Alternatives considered

- Mailchimp saved segment: Build a segment in UI for “did not open any of the last N campaigns” and purge via UI. Faster to execute but less flexible, and not easily auditable/automatable.
- Per-member activity only: Simpler but risks undercounting historical opens and triggers heavy API usage.

### Decisions captured (from your answers)

- Audience: `aavegotchi` (we will need the Audience ID for configuration).
- Engagement: never opened any email (all-time), including automations/journeys.
- Exclusions: none.
- Deletion mode: archive.
- Dry-run: yes, CSV output is sufficient.
- Volume: ~7,000 contacts; estimate ~50% candidates.
- Scheduling: one-off run.

### Acceptance criteria

- A dry-run produces a candidate list with accurate, explainable selection logic.
- Apply mode archives only the intended contacts, with complete audit logs and summary.
- The process respects rate limits and is resumable.
- Clear documentation for configuration, flags, and safety precautions.
