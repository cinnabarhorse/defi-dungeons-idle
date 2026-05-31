# Browser Test: [Feature Name]

## Test Overview

| Field | Value |
|-------|-------|
| **Test ID** | `[category]-[number]` |
| **Feature** | [Brief description of feature being tested] |
| **Priority** | High / Medium / Low |
| **Last Updated** | YYYY-MM-DD |

## Prerequisites

### Server Requirements
- [ ] Server running on `localhost:2567` (or configured port)
- [ ] Client running on `localhost:3001`
- [ ] [Any additional services needed]

### Starting the Servers (if not running)

**Terminal 1 - Game Server:**
```bash
cd /Users/coderdan/GitHub/gotchiverse-live/apps/server
pnpm dev
```

**Terminal 2 - Client:**
```bash
cd /Users/coderdan/GitHub/gotchiverse-live/apps/client
pnpm dev
```

### Shutting Down Servers (after testing)

Press `Ctrl+C` in each terminal to stop the servers.

### Dev Mode Configuration
```
http://localhost:3001/?dev=true&devMode=true&[parameters]
```

**Note:** `dev=true` enables dev wallet login, `devMode=true` enables game dev mode options.

| Parameter | Value | Purpose |
|-----------|-------|---------|
| `devMode` | `true` | Enable dev mode |
| `[param]` | `[value]` | [Purpose] |

---

## Test Steps

### Step 1: [Action Title]
**Action:** [Describe what the agent should do]

**Expected Result:**
- [Expected outcome 1]
- [Expected outcome 2]

---

### Step 2: [Action Title]
**Action:** [Describe what the agent should do]

**Expected Result:**
- [Expected outcome 1]
- [Expected outcome 2]

---

### Step N: [Action Title]
**Action:** [Describe what the agent should do]

**Expected Result:**
- [Expected outcome 1]
- [Expected outcome 2]

---

## Success Criteria

| Criterion | Required | How to Verify |
|-----------|----------|---------------|
| [Criterion 1] | ✅ Yes / ⚪ Optional | [Verification method] |
| [Criterion 2] | ✅ Yes / ⚪ Optional | [Verification method] |
| No console errors | ✅ Yes | Browser console is clean |

---

## Test Data

### [Data Category]
```typescript
// Relevant code snippets or configuration
```

### Expected Values
- [Value 1]: [Expected]
- [Value 2]: [Expected]

---

## Troubleshooting

### [Issue 1]
1. [Troubleshooting step 1]
2. [Troubleshooting step 2]

### [Issue 2]
1. [Troubleshooting step 1]
2. [Troubleshooting step 2]

---

## Related Files

| File | Purpose |
|------|---------|
| `[file path]` | [Purpose] |
| `[file path]` | [Purpose] |

---

## Test Execution Log

| Date | Tester | Result | Notes |
|------|--------|--------|-------|
| _YYYY-MM-DD_ | _Name_ | _Pass/Fail_ | _Notes_ |


