import 'dotenv/config';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

interface CliOptions {
  dryRun: boolean;
  jsonOutput: boolean;
  concurrency: number;
  listId: string;
  sinceDate?: string; // ISO date (YYYY-MM-DD)
  lookbackDays?: number;
  includeTags: string[]; // members must have ALL of these tags
  excludeTags: string[]; // members must NOT have ANY of these tags
}

interface ReportsListResponse {
  reports: Array<{
    id?: string;
    campaign_id: string;
    list_id?: string;
    send_time?: string;
  }>;
  total_items: number;
}

interface OpenDetailsResponse {
  members: Array<{
    email_address: string;
    opens_count?: number;
  }>;
  total_items: number;
}

interface SentToMembersResponse {
  members: Array<{
    email_address: string;
    status: string; // 'sent' | 'bounced' | ...
  }>;
  total_items: number;
}

interface ListMembersResponse {
  members: Array<{
    id: string; // Mailchimp's MD5 hash of lowercase email
    email_address: string;
    status: string;
    tags?: Array<{ id?: number; name: string }>;
  }>;
  total_items: number;
}

function parseCliOptions(envListId: string): CliOptions {
  const argv = process.argv.slice(2);
  const options: CliOptions = {
    dryRun: true,
    jsonOutput: false,
    concurrency: 4,
    listId: envListId,
    includeTags: [],
    excludeTags: [],
  };
  for (const arg of argv) {
    if (arg === '--apply') options.dryRun = false;
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg.startsWith('--dry-run='))
      options.dryRun = arg.split('=')[1] !== 'false';
    else if (arg === '--json') options.jsonOutput = true;
    else if (arg.startsWith('--concurrency=')) {
      const parsed = Number(arg.split('=')[1]);
      if (!Number.isNaN(parsed) && parsed > 0) options.concurrency = parsed;
    } else if (arg.startsWith('--list-id=')) {
      options.listId = arg.split('=')[1];
    } else if (arg.startsWith('--since=')) {
      // expects YYYY-MM-DD
      options.sinceDate = arg.split('=')[1];
    } else if (arg.startsWith('--lookback-days=')) {
      const parsed = Number(arg.split('=')[1]);
      if (!Number.isNaN(parsed) && parsed > 0) options.lookbackDays = parsed;
    } else if (
      arg.startsWith('--has-tag=') ||
      arg.startsWith('--include-tag=')
    ) {
      const v = arg.split('=')[1];
      if (v) options.includeTags.push(v);
    } else if (
      arg.startsWith('--without-tag=') ||
      arg.startsWith('--not-tag=') ||
      arg.startsWith('--exclude-tag=')
    ) {
      const v = arg.split('=')[1];
      if (v) options.excludeTags.push(v);
    }
  }
  if (!options.sinceDate && options.lookbackDays) {
    const ms = options.lookbackDays * 24 * 60 * 60 * 1000;
    const dt = new Date(Date.now() - ms);
    options.sinceDate = dt.toISOString().slice(0, 10);
  }
  return options;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(`Missing required env: ${name}`);
  }
  return value.trim();
}

function buildBaseUrl(dc: string): string {
  return `https://${dc}.api.mailchimp.com/3.0`;
}

function buildAuthHeader(apiKey: string): string {
  // Mailchimp accepts "Authorization: apikey <key>"
  return `apikey ${apiKey}`;
}

function md5Lowercase(input: string): string {
  return createHash('md5').update(input.toLowerCase()).digest('hex');
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function httpGet<T>(
  baseUrl: string,
  apiKey: string,
  path: string,
  query?: Record<string, string | number>
): Promise<T> {
  const queryString = query
    ? '?' +
      Object.entries(query)
        .filter(([, v]) => v !== undefined && v !== null && v !== '')
        .map(
          ([k, v]) =>
            `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`
        )
        .join('&')
    : '';
  const url = `${baseUrl}${path}${queryString}`;
  let attempt = 0;
  let delay = 500;
  // retry on 429 and 5xx
  while (true) {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: buildAuthHeader(apiKey),
        'Content-Type': 'application/json',
      },
    });
    if (res.ok) {
      return (await res.json()) as T;
    }
    const retriable =
      res.status === 429 || (res.status >= 500 && res.status < 600);
    if (!retriable || attempt >= 5) {
      const body = await res.text().catch(() => '');
      throw new Error(
        `GET ${path} failed: ${res.status} ${res.statusText} ${body}`
      );
    }
    attempt++;
    await sleep(delay + Math.floor(Math.random() * 150));
    delay *= 2;
  }
}

async function httpDelete(
  baseUrl: string,
  apiKey: string,
  path: string
): Promise<void> {
  const url = `${baseUrl}${path}`;
  let attempt = 0;
  let delay = 500;
  while (true) {
    const res = await fetch(url, {
      method: 'DELETE',
      headers: {
        Authorization: buildAuthHeader(apiKey),
        'Content-Type': 'application/json',
      },
    });
    if (res.ok) return;
    const retriable =
      res.status === 429 || (res.status >= 500 && res.status < 600);
    if (!retriable || attempt >= 5) {
      const body = await res.text().catch(() => '');
      throw new Error(
        `DELETE ${path} failed: ${res.status} ${res.statusText} ${body}`
      );
    }
    attempt++;
    await sleep(delay + Math.floor(Math.random() * 150));
    delay *= 2;
  }
}

async function listAllReportsForList(
  baseUrl: string,
  apiKey: string,
  listId: string,
  sinceDate?: string
): Promise<string[]> {
  const campaignIds: string[] = [];
  let offset = 0;
  const count = 1000;
  while (true) {
    const resp = await httpGet<ReportsListResponse>(
      baseUrl,
      apiKey,
      '/reports',
      {
        count,
        offset,
        fields:
          'reports.id,reports.campaign_id,reports.list_id,reports.send_time,total_items',
      }
    );
    for (const r of resp.reports ?? []) {
      const campaignId = r.campaign_id || r.id;
      // Some reports may not have list_id populated; keep those only if listId matches when present
      const includeList = !r.list_id || r.list_id === listId;
      let includeDate = true;
      if (sinceDate) {
        if (r.send_time) {
          includeDate = new Date(r.send_time) >= new Date(sinceDate);
        } else {
          // If no send_time is present and a since filter is applied, exclude conservatively
          includeDate = false;
        }
      }
      if (includeList && includeDate && campaignId) {
        campaignIds.push(campaignId);
      }
    }
    offset += count;
    if (offset >= (resp.total_items ?? 0)) break;
  }
  return campaignIds;
}

async function collectOpenersForCampaign(
  baseUrl: string,
  apiKey: string,
  campaignId: string
): Promise<Set<string>> {
  const openerHashes = new Set<string>();
  let offset = 0;
  const count = 1000;
  while (true) {
    const resp = await httpGet<OpenDetailsResponse>(
      baseUrl,
      apiKey,
      `/reports/${campaignId}/open-details`,
      {
        count,
        offset,
        fields: 'members.email_address,total_items',
      }
    );
    for (const m of resp.members ?? []) {
      if (m.email_address) {
        openerHashes.add(md5Lowercase(m.email_address));
      }
    }
    offset += count;
    if (offset >= (resp.total_items ?? 0)) break;
  }
  return openerHashes;
}

async function collectOpenersForCampaignWithCounts(
  baseUrl: string,
  apiKey: string,
  campaignId: string
): Promise<{ openerHashes: Set<string>; openEvents: number }> {
  const openerHashes = new Set<string>();
  let openEvents = 0;
  let offset = 0;
  const count = 1000;
  while (true) {
    const resp = await httpGet<OpenDetailsResponse>(
      baseUrl,
      apiKey,
      `/reports/${campaignId}/open-details`,
      {
        count,
        offset,
        fields: 'members.email_address,members.opens_count,total_items',
      }
    );
    for (const m of resp.members ?? []) {
      if (m.email_address) {
        openerHashes.add(md5Lowercase(m.email_address));
      }
      if (typeof m.opens_count === 'number') openEvents += m.opens_count;
    }
    offset += count;
    if (offset >= (resp.total_items ?? 0)) break;
  }
  return { openerHashes, openEvents };
}

interface EmailActivityResponse {
  emails: Array<{
    email_address: string;
    activity: Array<{ action: string }>;
  }>;
  total_items: number;
}

async function collectSentToForCampaign(
  baseUrl: string,
  apiKey: string,
  campaignId: string
): Promise<{ recipientHashes: Set<string>; sentOccurrences: number }> {
  const recipientHashes = new Set<string>();
  let sentOccurrences = 0;
  let offset = 0;
  const count = 1000;
  while (true) {
    const resp = await httpGet<SentToMembersResponse>(
      baseUrl,
      apiKey,
      `/reports/${campaignId}/sent-to`,
      {
        count,
        offset,
        fields: 'members.email_address,total_items',
      }
    );
    for (const m of resp.members ?? []) {
      if (m.email_address) {
        recipientHashes.add(md5Lowercase(m.email_address));
        sentOccurrences += 1;
      }
    }
    offset += count;
    if (offset >= (resp.total_items ?? 0)) break;
  }
  // Fallback via email-activity when sent-to does not return members
  if (recipientHashes.size === 0) {
    offset = 0;
    while (true) {
      const resp = await httpGet<EmailActivityResponse>(
        baseUrl,
        apiKey,
        `/reports/${campaignId}/email-activity`,
        {
          count,
          offset,
          fields: 'emails.email_address,total_items',
        }
      );
      for (const e of resp.emails ?? []) {
        if (e.email_address) {
          const h = md5Lowercase(e.email_address);
          if (!recipientHashes.has(h)) recipientHashes.add(h);
          sentOccurrences += 1;
        }
      }
      offset += count;
      if (offset >= (resp.total_items ?? 0)) break;
    }
  }
  return { recipientHashes, sentOccurrences };
}

async function collectBouncedForCampaign(
  baseUrl: string,
  apiKey: string,
  campaignId: string
): Promise<{ bouncedHashes: Set<string>; bouncedOccurrences: number }> {
  const bouncedHashes = new Set<string>();
  let bouncedOccurrences = 0;
  let offset = 0;
  const count = 1000;
  while (true) {
    const resp = await httpGet<SentToMembersResponse>(
      baseUrl,
      apiKey,
      `/reports/${campaignId}/sent-to`,
      {
        count,
        offset,
        status: 'bounced',
        fields: 'members.email_address,members.status,total_items',
      }
    );
    for (const m of resp.members ?? []) {
      if (m.email_address) {
        bouncedHashes.add(md5Lowercase(m.email_address));
        bouncedOccurrences += 1;
      }
    }
    offset += count;
    if (offset >= (resp.total_items ?? 0)) break;
  }
  // Fallback via email-activity if nothing found (some accounts expose bounces only there)
  if (bouncedHashes.size === 0) {
    offset = 0;
    while (true) {
      const resp = await httpGet<EmailActivityResponse>(
        baseUrl,
        apiKey,
        `/reports/${campaignId}/email-activity`,
        {
          count,
          offset,
          fields: 'emails.email_address,emails.activity.action,total_items',
        }
      );
      for (const e of resp.emails ?? []) {
        const bounced = (e.activity ?? []).some((a) =>
          ['bounce', 'bounced', 'hard', 'soft'].includes(a.action)
        );
        if (bounced && e.email_address) {
          const h = md5Lowercase(e.email_address);
          if (!bouncedHashes.has(h)) bouncedHashes.add(h);
          bouncedOccurrences += 1;
        }
      }
      offset += count;
      if (offset >= (resp.total_items ?? 0)) break;
    }
  }
  return { bouncedHashes, bouncedOccurrences };
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T, idx: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  let active = 0;
  return await new Promise<R[]>((resolve, reject) => {
    const launchNext = () => {
      while (active < limit && nextIndex < items.length) {
        const current = nextIndex++;
        active++;
        mapper(items[current], current)
          .then((r) => {
            results[current] = r;
            active--;
            if (
              results.length === items.length &&
              nextIndex >= items.length &&
              active === 0
            )
              resolve(results);
            else launchNext();
          })
          .catch((err) => reject(err));
      }
      if (nextIndex >= items.length && active === 0) resolve(results);
    };
    launchNext();
  });
}

async function aggregateEverOpenedSet(
  baseUrl: string,
  apiKey: string,
  campaignIds: string[],
  concurrency: number
): Promise<Set<string>> {
  const everOpened = new Set<string>();
  const openerSets = await mapWithConcurrency(
    campaignIds,
    concurrency,
    async (id) => collectOpenersForCampaign(baseUrl, apiKey, id)
  );
  for (const set of openerSets) {
    for (const h of set) everOpened.add(h);
  }
  return everOpened;
}

async function aggregateOpenStats(
  baseUrl: string,
  apiKey: string,
  campaignIds: string[],
  concurrency: number
): Promise<{ everOpened: Set<string>; totalOpenEvents: number }> {
  const everOpened = new Set<string>();
  let totalOpenEvents = 0;
  const results = await mapWithConcurrency(
    campaignIds,
    concurrency,
    async (id) => collectOpenersForCampaignWithCounts(baseUrl, apiKey, id)
  );
  for (const r of results) {
    for (const h of r.openerHashes) everOpened.add(h);
    totalOpenEvents += r.openEvents;
  }
  return { everOpened, totalOpenEvents };
}

async function aggregateSentToStats(
  baseUrl: string,
  apiKey: string,
  campaignIds: string[],
  concurrency: number
): Promise<{ everSentTo: Set<string>; totalSentOccurrences: number }> {
  const everSentTo = new Set<string>();
  let totalSentOccurrences = 0;
  const results = await mapWithConcurrency(
    campaignIds,
    concurrency,
    async (id) => collectSentToForCampaign(baseUrl, apiKey, id)
  );
  for (const r of results) {
    for (const h of r.recipientHashes) everSentTo.add(h);
    totalSentOccurrences += r.sentOccurrences;
  }
  return { everSentTo, totalSentOccurrences };
}

async function aggregateEverBouncedSet(
  baseUrl: string,
  apiKey: string,
  campaignIds: string[],
  concurrency: number
): Promise<Set<string>> {
  const everBounced = new Set<string>();
  const bouncedSets = await mapWithConcurrency(
    campaignIds,
    concurrency,
    async (id) => {
      const { bouncedHashes } = await collectBouncedForCampaign(
        baseUrl,
        apiKey,
        id
      );
      return bouncedHashes;
    }
  );
  for (const set of bouncedSets) {
    for (const h of set) everBounced.add(h);
  }
  return everBounced;
}

async function aggregateBounceStats(
  baseUrl: string,
  apiKey: string,
  campaignIds: string[],
  concurrency: number
): Promise<{ everBounced: Set<string>; bouncedOccurrences: number }> {
  const everBounced = new Set<string>();
  let bouncedOccurrences = 0;
  const results = await mapWithConcurrency(
    campaignIds,
    concurrency,
    async (id) => collectBouncedForCampaign(baseUrl, apiKey, id)
  );
  for (const r of results) {
    for (const h of r.bouncedHashes) everBounced.add(h);
    bouncedOccurrences += r.bouncedOccurrences;
  }
  return { everBounced, bouncedOccurrences };
}

interface MemberTagsResponse {
  tags: Array<{ name: string; status?: string }>;
  total_items: number;
}

async function fetchMemberTags(
  baseUrl: string,
  apiKey: string,
  listId: string,
  subscriberHash: string
): Promise<Set<string>> {
  const resp = await httpGet<MemberTagsResponse>(
    baseUrl,
    apiKey,
    `/lists/${listId}/members/${subscriberHash}/tags`,
    { fields: 'tags.name,total_items' }
  );
  const set = new Set<string>();
  for (const t of resp.tags ?? []) {
    if (t.name) set.add(t.name);
  }
  return set;
}

async function collectTagsForMembers(
  baseUrl: string,
  apiKey: string,
  listId: string,
  members: ListMembersResponse['members'],
  concurrency: number
): Promise<Map<string, Set<string>>> {
  const map = new Map<string, Set<string>>();
  await mapWithConcurrency(members, concurrency, async (m) => {
    const tags = await fetchMemberTags(baseUrl, apiKey, listId, m.id);
    map.set(m.id, tags);
  });
  return map;
}

function computeCandidatesByTags(
  subscribedMembers: ListMembersResponse['members'],
  tagsById: Map<string, Set<string>>,
  includeTags: string[],
  excludeTags: string[]
) {
  const candidates = [];
  for (const m of subscribedMembers) {
    const tagSet = tagsById.get(m.id) ?? new Set<string>();
    const hasAllInclude =
      includeTags.length === 0 || includeTags.every((t) => tagSet.has(t));
    const hasAnyExclude =
      excludeTags.length > 0 && excludeTags.some((t) => tagSet.has(t));
    if (hasAllInclude && !hasAnyExclude) {
      const reasons = [
        ...includeTags.map((t) => `has_tag:${t}`),
        ...excludeTags.map((t) => `not_tag:${t}`),
      ];
      candidates.push({
        ...m,
        _reasons: reasons,
      });
    }
  }
  return candidates as Array<
    ListMembersResponse['members'][number] & { _reasons: string[] }
  >;
}

async function listAllSubscribedMembers(
  baseUrl: string,
  apiKey: string,
  listId: string,
  includeTags = false
): Promise<ListMembersResponse['members']> {
  const members: ListMembersResponse['members'] = [];
  let offset = 0;
  const count = 1000;
  while (true) {
    const query: Record<string, string | number> = {
      count,
      offset,
      status: 'subscribed',
    };
    if (!includeTags) {
      query.fields =
        'members.id,members.email_address,members.status,total_items';
    }
    const resp = await httpGet<ListMembersResponse>(
      baseUrl,
      apiKey,
      `/lists/${listId}/members`,
      query
    );
    for (const m of resp.members ?? []) {
      if (m.status === 'subscribed') members.push(m);
    }
    offset += count;
    if (offset >= (resp.total_items ?? 0)) break;
  }
  return members;
}

function computeCandidatesWithReasons(
  subscribedMembers: ListMembersResponse['members'],
  everOpened: Set<string>,
  everBounced: Set<string>,
  everSentTo: Set<string>,
  sinceDate?: string
) {
  const reasonsById = new Map<string, Set<string>>();
  const noOpenReason = sinceDate
    ? `no_opens_since_${sinceDate}`
    : 'no_opens_all_time';
  const notSentReason = sinceDate
    ? `not_sent_since_${sinceDate}`
    : 'never_received_any_email';
  for (const m of subscribedMembers) {
    const reasons = new Set<string>();
    if (!everOpened.has(m.id)) reasons.add(noOpenReason);
    if (everBounced.has(m.id)) reasons.add('bounced_any_campaign');
    if (!everSentTo.has(m.id)) reasons.add(notSentReason);
    if (reasons.size > 0) reasonsById.set(m.id, reasons);
  }
  const candidates = subscribedMembers
    .filter((m) => reasonsById.has(m.id))
    .map((m) => ({
      ...m,
      _reasons: Array.from(reasonsById.get(m.id) ?? []),
    }));
  return candidates as Array<
    ListMembersResponse['members'][number] & { _reasons: string[] }
  >;
}

function createCsv(rows: Array<Record<string, string>>): string {
  if (rows.length === 0) return 'email_address,subscriber_hash,status,reason\n';
  const header = Object.keys(rows[0]).join(',') + '\n';
  const body = rows
    .map((r) =>
      Object.values(r)
        .map((v) => {
          const needsQuotes =
            v.includes(',') || v.includes('"') || v.includes('\n');
          if (!needsQuotes) return v;
          return `"${v.replace(/"/g, '""')}"`;
        })
        .join(',')
    )
    .join('\n');
  return header + body + '\n';
}

async function ensureDir(path: string): Promise<void> {
  if (!existsSync(path)) {
    await mkdir(path, { recursive: true });
  }
}

async function main(): Promise<void> {
  const apiKey = requireEnv('MAILCHIMP_API_KEY');
  const dc = requireEnv('MAILCHIMP_DC');
  const envListId = requireEnv('MAILCHIMP_LIST_ID');
  const opts = parseCliOptions(envListId);
  const baseUrl = buildBaseUrl(dc);

  console.log(
    `Mailchimp purge — list ${opts.listId} — dryRun=${opts.dryRun} — concurrency=${opts.concurrency}${
      opts.sinceDate ? ` — since=${opts.sinceDate}` : ''
    }${
      opts.includeTags.length || opts.excludeTags.length
        ? ` — includeTags=${JSON.stringify(opts.includeTags)} — excludeTags=${JSON.stringify(opts.excludeTags)}`
        : ''
    }`
  );

  let campaignIds: string[] = [];
  let everOpened = new Set<string>();
  let totalOpenEvents = 0;
  let everBounced = new Set<string>();
  let bouncedOccurrences = 0;
  let everSentTo = new Set<string>();
  let totalSentOccurrences = 0;

  const useTagFiltering =
    opts.includeTags.length > 0 || opts.excludeTags.length > 0;

  if (!useTagFiltering) {
    // 1) Discover campaigns via reports (covers regular + automations/journeys)
    campaignIds = await listAllReportsForList(
      baseUrl,
      apiKey,
      opts.listId,
      opts.sinceDate
    );
    console.log(
      `Discovered ${campaignIds.length} report(s) for list ${opts.listId}`
    );

    // 2) Build open stats (unique + total opens across campaigns)
    const openStats = await aggregateOpenStats(
      baseUrl,
      apiKey,
      campaignIds,
      opts.concurrency
    );
    everOpened = openStats.everOpened;
    totalOpenEvents = openStats.totalOpenEvents;
    console.log(
      `Aggregated ${everOpened.size} unique opener(s), total open events=${totalOpenEvents}`
    );

    // 2b) Build bounce stats (unique + occurrences across campaigns)
    const bounceStats = await aggregateBounceStats(
      baseUrl,
      apiKey,
      campaignIds,
      opts.concurrency
    );
    everBounced = bounceStats.everBounced;
    bouncedOccurrences = bounceStats.bouncedOccurrences;
    console.log(
      `Aggregated ${everBounced.size} unique bounced recipient(s), occurrences=${bouncedOccurrences}`
    );

    // 2c) Build sent-to stats (unique + total times included across campaigns)
    const sentStats = await aggregateSentToStats(
      baseUrl,
      apiKey,
      campaignIds,
      opts.concurrency
    );
    everSentTo = sentStats.everSentTo;
    totalSentOccurrences = sentStats.totalSentOccurrences;
    console.log(
      `Aggregated ${everSentTo.size} unique recipients who were ever sent to, total sent occurrences=${totalSentOccurrences}`
    );
  }

  // 3) Enumerate subscribed members
  const subscribedMembers = await listAllSubscribedMembers(
    baseUrl,
    apiKey,
    opts.listId,
    useTagFiltering
  );
  console.log(`Fetched ${subscribedMembers.length} subscribed member(s)`);

  // 4) Determine candidates
  let candidates: Array<
    ListMembersResponse['members'][number] & { _reasons: string[] }
  > = [];
  let noOpenKey = '';
  let notSentKey = '';
  let neverOpenedCount = 0;
  let bouncedCount = 0;
  let neverReceivedCount = 0;

  if (useTagFiltering) {
    // Build tag map from embedded tags on member payload
    const tagsById = new Map<string, Set<string>>();
    for (const m of subscribedMembers) {
      const set = new Set<string>();
      for (const t of m.tags ?? []) {
        if (t?.name) set.add(t.name);
      }
      tagsById.set(m.id, set);
    }
    candidates = computeCandidatesByTags(
      subscribedMembers,
      tagsById,
      opts.includeTags,
      opts.excludeTags
    );
    console.log(
      `Candidates (by tags): ${candidates.length} (include=${JSON.stringify(
        opts.includeTags
      )}, exclude=${JSON.stringify(opts.excludeTags)})`
    );
  } else {
    candidates = computeCandidatesWithReasons(
      subscribedMembers,
      everOpened,
      everBounced,
      everSentTo,
      opts.sinceDate
    );
    noOpenKey = opts.sinceDate
      ? `no_opens_since_${opts.sinceDate}`
      : 'no_opens_all_time';
    notSentKey = opts.sinceDate
      ? `not_sent_since_${opts.sinceDate}`
      : 'never_received_any_email';
    neverOpenedCount = candidates.filter((c) =>
      c._reasons.includes(noOpenKey)
    ).length;
    bouncedCount = candidates.filter((c) =>
      c._reasons.includes('bounced_any_campaign')
    ).length;
    neverReceivedCount = candidates.filter((c) =>
      c._reasons.includes(notSentKey)
    ).length;
    console.log(
      `Candidates: ${candidates.length} (${noOpenKey}=${neverOpenedCount}, bounced_any_campaign=${bouncedCount}, ${notSentKey}=${neverReceivedCount})`
    );
  }

  // 5) Output
  const outDir = join(process.cwd(), 'mailchimp-purge');
  await ensureDir(outDir);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const csvRows = candidates.map((c) => ({
    email_address: c.email_address,
    subscriber_hash: c.id,
    status: c.status,
    reason: c._reasons.join('|'),
  }));
  const csv = createCsv(csvRows);
  const csvPath = join(outDir, `dry-run-${timestamp}.csv`);
  await writeFile(csvPath, csv, 'utf8');
  // Always write a run summary
  const summary = {
    totalReports: campaignIds.length,
    uniqueOpeners: everOpened.size,
    totalOpenEvents,
    uniqueBounced: everBounced.size,
    bouncedOccurrences,
    uniqueSentTo: everSentTo.size,
    totalSentOccurrences,
    totalSubscribed: subscribedMembers.length,
    candidates: candidates.length,
    neverOpened: neverOpenedCount, // label varies by sinceDate
    bouncedAnyCampaign: bouncedCount,
    neverReceivedAnyEmail: neverReceivedCount, // label varies by sinceDate
    sinceDate: opts.sinceDate,
    includeTags: opts.includeTags,
    excludeTags: opts.excludeTags,
  };
  const summaryPath = join(outDir, `summary-${timestamp}.json`);
  await writeFile(summaryPath, JSON.stringify(summary, null, 2), 'utf8');
  console.log(`Summary written: ${summaryPath}`);
  if (opts.jsonOutput) {
    const jsonPath = join(outDir, `dry-run-${timestamp}.json`);
    await writeFile(
      jsonPath,
      JSON.stringify(
        {
          candidates,
          summary: {
            ...summary,
          },
        },
        null,
        2
      ),
      'utf8'
    );
  }
  console.log(`Dry-run report written: ${csvPath}`);

  // 6) Apply (archive) — only if explicitly requested
  if (!opts.dryRun) {
    console.log('Applying archive (archive only, no permanent delete)...');
    let archived = 0;
    let failed = 0;
    await mapWithConcurrency(candidates, opts.concurrency, async (c) => {
      try {
        await httpDelete(
          baseUrl,
          apiKey,
          `/lists/${opts.listId}/members/${c.id}`
        );
        archived++;
      } catch (err) {
        failed++;
        console.error(`Failed to archive ${c.email_address}:`, err);
      }
    });
    const summary = {
      totalSubscribed: subscribedMembers.length,
      everOpened: everOpened.size,
      everBounced: everBounced.size,
      candidates: candidates.length,
      archived,
      failed,
    };
    const logPath = join(outDir, `run-${timestamp}.json`);
    await writeFile(logPath, JSON.stringify({ summary }, null, 2), 'utf8');
    console.log(
      `Apply complete. Archived=${archived} Failed=${failed}. Log: ${logPath}`
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
