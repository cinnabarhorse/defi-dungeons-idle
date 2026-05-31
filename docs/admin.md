## Supabase Admin UI – Pre‑Implementation Questions

This document captures the key questions and decisions needed before implementing an Admin UI to browse all tables and drill down into their rows.

### 1) Scope and capabilities

- Read‑only or full CRUD? If write:

Read only.

- Which tables allow create/update/delete?
- Any fields immutable after creation?
- Bulk actions needed (bulk delete, bulk update, import)?
- Data export needed (CSV/JSON for current page vs entire filtered set)?
- Any tables/columns to explicitly exclude from the UI?

### 2) Access control and authentication

- Who can access the Admin UI (emails, roles, wallet allowlist)?

0xC3c2e1Cf099Bc6e1fA94ce358562BCbD5cc59FE5 Only this address for now.

- Preferred gate: Supabase Auth, NextAuth, or existing wallet auth? Any SSO?

Existing wallet auth with back end check.

- Should access be restricted by environment (dev/staging/prod)?

Right now we only have prod.

- Timeout/idle logout requirements?

Nope.

### 3) Security, RLS, and keys

- Are RLS policies enabled on target tables?

No policies yet.

- Will the Admin UI use the Supabase service role on the server to bypass RLS? If yes, confirm the service role key will only be used in server code and never shipped to the client.

I'm not really sure what that means. This is a weed on the apple.

- Columns with sensitive data (PII/keys/secrets) to mask or hide?

Mask them.

- IP allowlisting or additional protections required for the admin routes/API?

Not right now.

### 4) Target schemas and table set

- Which schemas to include (e.g., `public` only)?

All schemas.

- Exclude Supabase internal schemas/tables (e.g., `auth.*`, `storage.*`, `pg_*`, migrations)? Please list any additional exclusions.

Nope, include them all.

- Include views/materialized views? Are they read‑only in the UI?

Everything is read only.

### 5) Table relationships and references

- Should foreign keys render as links to referenced rows?
- Display human‑readable labels for FKs (e.g., referenced row name) or raw IDs only?
- Many‑to‑many junction tables: show linked rows inline or via drill‑through?

Whatever is normal in the fall probably things rose.

### 6) List views (table pages)

- Default columns to show per table; columns to hide by default?

All columns. If the page is too long, then add a scroll bar.

- Default sort and secondary sorts? Persist user column visibility/order per table?

Every number should be sortable.

- Pagination strategy: offset (page 1,2,3) or cursor/infinite scroll? Page sizes?

pagination with sorts.

- Filters: per‑column operators (equals, contains, range, in‑list, date range)? Saved views?

No filters yet, we'll add those in later.

- Search: global search across visible columns vs per‑column only?

No search yet.

- Row count: exact counts vs approximate/estimated for performance on large tables?

### 7) Row detail views

- Show all columns with type‑aware renderers (timestamps, booleans, JSON, arrays)?

yes

- Large/JSONB fields: pretty‑print, collapse by default, copy/download controls?

none

- Related rows: show in tabs/sections? Limits and pagination for related lists?

### 8) Performance expectations

- Largest expected row counts per key tables? Any tables >1M rows?

nope

- Acceptable initial table load time (ms)?

<5s

- Should we use virtualization for large lists and lazy‑load heavy cells (e.g., JSON)?

yes but not needed yet

- Revalidation/caching: how fresh must data be? Manual refresh control needed?

### 9) Routing and IA (Next.js App Router)

- URL structure: `/admin` → schema list → `/admin/[schema]/[table]` for table view → `/admin/[schema]/[table]/[id]` for row detail?
- Breadcrumbs needed? Back‑to‑list behavior?
- Surface counts next to tables? Show last updated timestamp per table?

### 10) UI/UX and component choices

- Use Shadcn UI + Radix + Tailwind for tables, forms, dialogs? Confirm we can add any missing primitives.
- Data grid approach: TanStack Table for column visibility, sorting, filtering, pinning? Is adding this dependency acceptable?
- Dark mode support and accessibility requirements (keyboard nav, ARIA, focus management)?
- Mobile layout: read‑only on small screens acceptable, or fully responsive CRUD?

### 11) State and URL management

- Persist table state (sort, filters, pagination, visible columns) in URL using `nuqs`? Any privacy concerns with URL‑encoded filters?

yes, persist them.

- Remember last‑visited table and state between sessions (localStorage/server session)?

### 12) Server vs client boundaries

- Favor React Server Components for data fetching; any exceptions requiring client components?

nope

- All data access from server only (route handlers/server components) to avoid exposing privileged keys?
- Streaming large responses vs paginated fetches per interaction?

### 13) Error handling and observability

- Error surfaces: inline row errors, toast notifications, error boundaries?
- Logging/monitoring for admin actions and queries (server logs, structured events)?
- Audit trail required even for read‑only access (who viewed which rows)?

### 14) Environments and configuration

- Supabase projects/keys per environment (dev/staging/prod)?
- Environment variable names for Supabase URL, anon key, and service role key?
- Feature flag to disable Admin UI in non‑admin deployments?

### 15) Compliance and data governance

- PII/PHI present? Redaction/obfuscation rules?
- Data retention or right‑to‑erasure constraints impacting admin features?

### 16) Nice‑to‑have (confirm priority)

- CSV/JSON export of filtered results
- Quick column profiler (null %, min/max, distinct count)
- Saved views per user
- Row history/versioning view if available
- Keyboard shortcuts (search, toggle columns, next/prev page)

### 17) Acceptance criteria

- What is the minimal viable Admin UI we should ship first?
- Which tables must be included in v1?
- Performance and usability thresholds for sign‑off?

---

Please annotate answers inline or reply in chat, and I will translate them into concrete implementation tasks.
