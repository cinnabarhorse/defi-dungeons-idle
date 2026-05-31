## Coverage Test Audit (Prompt)

You are an autonomous **coverage auditor** for this repository. Your job is to **deeply scan the codebase (or a target subtree I specify)** and generate a **coverage audit report** that maps **code paths & logic trails → existing tests**, identifies **coverage gaps**, and outputs a **prioritized test plan**.

### Input (read carefully)

- **Target scope**: If the user provides a path like `@apps/server/src/rooms/`, only audit that subtree. Otherwise audit the whole repo.
- **Test scope**: Include all tests that cover the target: Jest unit tests, integration tests, simulation tests, snapshot tests, e2e tests (Playwright), and any test helpers/fixtures.
- **Depth level**: Default to deep (follow imports + call chains) unless the user asks for “quick”.
- **Constraints**:
  - Do **not** rely on line coverage % alone; treat coverage as **behavioral**: branches, error paths, boundary conditions, state transitions, and invariants.
  - Prefer deterministic evidence. If you run tests, use the repo’s default loop: **`pnpm test:agent`** (unless the user requests another tier).
  - Snapshot diffs must be intentional and explained if you propose them.

### Outputs (what you MUST produce)

Produce a single report in markdown named **“Coverage Test Audit Report”** containing:

1. **Executive summary**
   - What was audited (target paths)
   - What test suites were considered
   - Top 3–7 coverage risks / missing behaviors
2. **Coverage map**
   - A table mapping key modules/functions → current tests that exercise them (directly/indirectly)
3. **Logic trails & code paths analysis**
   - For each critical unit, list:
     - Mainline flows
     - Branches (if/else, switch, early returns)
     - Error/exception paths
     - Boundary & edge conditions
     - State transitions / side effects
4. **Gap analysis**
   - Explicitly enumerate missing test coverage areas:
     - Uncovered branches / guard clauses
     - Failure modes not asserted
     - Race/ordering issues
     - Serialization/deserialization boundaries
     - Time/seed randomness surfaces
     - External integrations mocked incorrectly or not at all
5. **Prioritized test backlog**
   - A numbered list of test additions with:
     - Target file/function(s)
     - Test type (unit/integration/sim/snapshot/e2e)
     - Scenario(s)
     - Why it matters (risk/impact)
     - Expected assertions
     - Estimated effort (S/M/L)
6. **Optional: coverage instrumentation evidence**
   - If you ran coverage tooling, include:
     - Commands run
     - Summary stats (only if available)
     - Notes about any limitations

### Required methodology (follow in order)

#### 1) Establish scope and inventory

- Identify:
  - Target production code directories/files
  - Relevant test directories/files
  - Shared fixtures/mocks and test utilities
- Exclude:
  - Generated artifacts, build output, vendored deps
  - Static assets (images, etc.)
  - Pure data catalogs unless they contain logic

#### 2) Build a “behavior surface area” model (static)

For the target scope:

- Identify “units of behavior”:
  - exported functions, hooks, route handlers, room logic, reducers, services, critical helpers
- For each unit:
  - enumerate inputs, outputs, side effects
  - enumerate internal branches and guard clauses
  - enumerate error cases and boundary conditions
  - enumerate state transitions and invariants
- Build logic trails:
  - follow call chains for important flows (e.g. request → service → persistence; or event → room → economy → persistence)
  - highlight high-risk edges: randomness, time, concurrency, network/db boundaries

#### 3) Map behaviors to tests (static cross-reference)

For each unit/flow:

- Find tests that cover it via:
  - direct import and invocation
  - integration paths (higher-level tests exercising the unit indirectly)
  - snapshots verifying derived state
- Classify coverage confidence:
  - **Strong**: tests assert key outputs + at least one edge case/branch
  - **Medium**: exercised indirectly but assertions are weak/general
  - **Weak**: incidental execution with no meaningful assertion
  - **None**: no evidence of execution

#### 4) Optional dynamic evidence (run coverage) — only if feasible

If the user did not forbid running commands, attempt to run:

- `pnpm test:agent`

If coverage flags are supported in this repo’s test runner, also attempt one of:

- `pnpm test:agent -- --coverage`
- or `pnpm test -- --coverage`

If coverage cannot run (config/env missing), continue with the static audit and clearly label it as such.

#### 5) Produce the report with actionable recommendations

The report must be:

- **Specific**: name files/functions, name missing branches, show what to assert
- **Prioritized**: highest risk first
- **Pragmatic**: prefer small, high-signal tests over brittle ones
- **Deterministic**: fixed seeds/time mocking where needed

### Report format (copy this exactly)

## Coverage Test Audit Report

### Scope
- **Target**: <paths>
- **Tests considered**: <paths/suites>
- **Audit type**: static | static + dynamic evidence

### Executive summary
- **Overall coverage confidence**: Strong | Medium | Weak
- **Top risks**
  1. …
  2. …
  3. …

### Coverage map (module → tests)
| Module / Unit | Key behaviors | Current tests | Confidence | Notes |
|---|---|---|---|---|
| … | … | … | Strong/Medium/Weak/None | … |

### Logic trails & code paths
#### <Unit or flow name>
- **Entry points**:
- **Mainline**:
- **Branches**:
- **Error paths**:
- **Boundaries**:
- **State/side effects**:
- **Tests covering**:
- **Gaps**:

### Gap analysis (by category)
- **Uncovered branches**:
- **Missing failure-mode assertions**:
- **Missing boundary tests**:
- **State transition gaps**:
- **Integration boundary gaps**:

### Prioritized test backlog
1. **<Test name>**
   - **Targets**: <file / function>
   - **Type**: unit | integration | sim | snapshot | e2e
   - **Scenario**:
   - **Assertions**:
   - **Why**:
   - **Effort**: S | M | L

### Dynamic evidence (optional)
- **Commands run**:
- **Results**:
- **Limitations**:

### Ground rules for writing new tests (if asked to implement)

- Prefer tests that validate **outcomes + invariants**, not implementation details.
- Cover at least:
  - happy path
  - a boundary case
  - a failure case
  - a branch decision
- Use deterministic seeds/time mocking for randomness/time.
- Avoid broad snapshot updates; explain any snapshot changes.

