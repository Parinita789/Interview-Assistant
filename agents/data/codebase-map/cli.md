# cli module map

_Generated 2026-05-20T18:37:53.826Z (model: claude-sonnet-4-6)_

## Summary

- **10** modules
- **10** source files + **4** test files
- **1** modules with no inbound internal deps (entry points / leaves)
- **10** module(s) had a responsibility-synthesis failure

## Module: aiBuffer

**Path:** `cli/src/aiBuffer.ts`
**Files:** 1
**Key exports:** `AIBuffer`, `BufferedAITurn`
**Depends on (internal):** aiLogs
**Depended on by (internal):** api, finish, status, watch
**External:** `node:fs`, `node:os`, `node:path`

**Responsibility:** _(synthesis failed: claude CLI exited with code 1: (empty stderr))_

## Module: aiLogs

**Path:** `cli/src/aiLogs.ts`
**Files:** 1 (1 tests)
**Key exports:** `ClaudeCodeLogReader`, `encodedCwd`, `claudeProjectDir`, `parseClaudeCodeLine`, `TEXT_CAP`, `TOOL_INPUT_CAP`, `TOOL_RESULT_CAP`, `NormalizedAITurn`, +2 more
**Depends on (internal):** _none_
**Depended on by (internal):** aiBuffer, watch
**External:** `node:fs`, `node:os`, `node:path`

**Responsibility:** _(synthesis failed: claude CLI exited with code 1: (empty stderr))_

## Module: api

**Path:** `cli/src/api.ts`
**Files:** 1 (1 tests)
**Key exports:** `MentorApiClient`, `describeError`, `sendWithBackoff`, `drainBuffer`, `sendAiWithBackoff`, `drainAiBuffer`, `DEFAULT_BACKOFF_MS`, `ApiClientOptions`, +2 more
**Depends on (internal):** aiBuffer, buffer
**Depended on by (internal):** finish, watch
**External:** `axios`

**Responsibility:** _(synthesis failed: claude CLI exited with code 1: (empty stderr))_

## Module: buffer

**Path:** `cli/src/buffer.ts`
**Files:** 1 (1 tests)
**Key exports:** `EventBuffer`, `BufferedEvent`, `NewEvent`, `EventAction`
**Depends on (internal):** _none_
**Depended on by (internal):** api, finish, status, watch
**External:** `node:fs`, `node:os`, `node:path`

**Responsibility:** _(synthesis failed: claude CLI exited with code 1: (empty stderr))_

## Module: config

**Path:** `cli/src/config.ts`
**Files:** 1
**Key exports:** `writeSession`, `readSession`, `writeState`, `readState`, `configDir`, `SessionConfig`, `RuntimeState`
**Depends on (internal):** _none_
**Depended on by (internal):** finish, status, watch
**External:** `node:fs`, `node:os`, `node:path`

**Responsibility:** _(synthesis failed: claude CLI exited with code 1: (empty stderr))_

## Module: diff

**Path:** `cli/src/diff.ts`
**Files:** 1 (1 tests)
**Key exports:** `isNoopOutcome`, `isLikelyBinary`, `shouldRebaseline`, `computeChange`, `PrevState`, `DiffOutcome`
**Depends on (internal):** _none_
**Depended on by (internal):** watch
**External:** `diff`

**Responsibility:** _(synthesis failed: claude CLI exited with code 1: (empty stderr))_

## Module: finish

**Path:** `cli/src/finish.ts`
**Files:** 1
**Key exports:** `runFinish`, `FinishOptions`
**Depends on (internal):** aiBuffer, api, buffer, config
**Depended on by (internal):** index
**External:** `chalk`

**Responsibility:** _(synthesis failed: claude CLI exited with code 1: (empty stderr))_

## Module: index

**Path:** `cli/src/index.ts`
**Files:** 1
**Key exports:** _none_
**Depends on (internal):** finish, status, watch
**Depended on by (internal):** _none_
**External:** `commander`

**Responsibility:** _(synthesis failed: claude CLI exited with code 1: (empty stderr))_

## Module: status

**Path:** `cli/src/status.ts`
**Files:** 1
**Key exports:** `runStatus`
**Depends on (internal):** aiBuffer, buffer, config
**Depended on by (internal):** index
**External:** `chalk`

**Responsibility:** _(synthesis failed: claude CLI exited with code 1: (empty stderr))_

## Module: watch

**Path:** `cli/src/watch.ts`
**Files:** 1
**Key exports:** `runWatch`, `WatchOptions`
**Depends on (internal):** aiBuffer, aiLogs, api, buffer, config, diff
**Depended on by (internal):** index
**External:** `chalk`, `chokidar`, `ignore`, `node:fs`, `node:path`

**Responsibility:** _(synthesis failed: claude CLI exited with code 1: (empty stderr))_
