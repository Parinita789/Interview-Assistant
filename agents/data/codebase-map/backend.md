# backend module map

_Generated 2026-05-20T18:33:21.392Z (model: claude-sonnet-4-6)_

## Summary

- **24** modules
- **167** source files + **55** test files
- **2** modules with no inbound internal deps (entry points / leaves)
- **24** module(s) had a responsibility-synthesis failure

## Module: artifacts

**Path:** `backend/src/modules/artifacts`
**Files:** 7
**Key exports:** `ArtifactsModule`, `ArtifactsRepository`, `ArtifactsService`, `ClaudeJsonlService`, `GitLogService`, `ProjectFilesService`, `JsonlEntry`, `FinalArtifacts`
**Depends on (internal):** database, snapshots
**Depended on by (internal):** _root, evaluations, phase-tagger
**External:** `@nestjs/common`

**Responsibility:** _(synthesis failed: claude CLI exited with code 1: (empty stderr))_

## Module: auth

**Path:** `backend/src/modules/auth`
**Files:** 15 (6 tests)
**Key exports:** `AuthModule`, `IS_CLI_AUTHENTICATED_KEY`, `CliAuthenticated`, `CurrentUser`, `IS_PUBLIC_KEY`, `Public`, `LoginDto`, `SignupDto`, +14 more
**Depends on (internal):** database, throttling
**Depended on by (internal):** _root, build-sessions, cost-cap, evaluations, hints, mentor, questions, sessions, signal-mentor, snapshots, throttling
**External:** `@nestjs/common`, `@nestjs/jwt`, `@prisma/client`, `class-validator`, `@nestjs/config`

**Responsibility:** _(synthesis failed: claude CLI exited with code 1: (empty stderr))_

## Module: build-sessions

**Path:** `backend/src/modules/build-sessions`
**Files:** 11 (5 tests)
**Key exports:** `BuildSessionsModule`, `BuildAIInteractionDto`, `BuildAIInteractionBatchDto`, `BuildEventDto`, `BuildEventBatchDto`, `BuildSessionGuard`, `resolvedBuildSessionId`, `AuthedRequest`, +10 more
**Depends on (internal):** auth, database, evaluations, build-sessions-data, common
**Depended on by (internal):** _root, build-sessions-data, evaluations
**External:** `@nestjs/common`, `@nestjs/swagger`, `class-transformer`, `class-validator`, `@nestjs/event-emitter`

**Responsibility:** _(synthesis failed: claude CLI exited with code 1: (empty stderr))_

## Module: build-sessions-data

**Path:** `backend/src/modules/build-sessions-data`
**Files:** 1
**Key exports:** `BuildSessionsDataModule`
**Depends on (internal):** build-sessions
**Depended on by (internal):** build-sessions, evaluations
**External:** `@nestjs/common`

**Responsibility:** _(synthesis failed: claude CLI exited with code 1: (empty stderr))_

## Module: cost-cap

**Path:** `backend/src/modules/cost-cap`
**Files:** 7 (4 tests)
**Key exports:** `CostCapModule`, `CostCapExceededError`, `CostCapController`, `estimateCostUsd`, `todayUtcMidnight`, `nextUtcMidnight`, `ModelPricing`, `UsageTokens`, +5 more
**Depends on (internal):** auth, database
**Depended on by (internal):** llm
**External:** `@nestjs/common`, `@nestjs/config`, `@nestjs/swagger`, `@prisma/client`

**Responsibility:** _(synthesis failed: claude CLI exited with code 1: (empty stderr))_

## Module: dashboard

**Path:** `backend/src/modules/dashboard`
**Files:** 5
**Key exports:** `DashboardModule`, `DashboardController`, `DashboardRepository`, `DashboardService`, `TrendPoint`, `HeatmapCell`, `WeaknessSummary`
**Depends on (internal):** database, phase-tagger
**Depended on by (internal):** _root
**External:** `@nestjs/common`, `@nestjs/swagger`

**Responsibility:** _(synthesis failed: claude CLI exited with code 1: (empty stderr))_

## Module: evaluations

**Path:** `backend/src/modules/evaluations`
**Files:** 34 (17 tests)
**Key exports:** `BasePhaseAgent`, `BuildAgent`, `PlanAgent`, `SynthesizerAgent`, `ValidateAgent`, `WrapAgent`, `RunEvaluationDto`, `EvaluationsModule`, +64 more
**Depends on (internal):** phase-tagger, llm, common, auth, config, session-read, artifacts, build-sessions, hints, snapshots, build-sessions-data, database, throttling
**Depended on by (internal):** _root, build-sessions, eval-harness, mentor, questions, sessions, signal-mentor
**External:** `@nestjs/common`, `@nestjs/config`, `@nestjs/swagger`, `@prisma/client`, `class-validator`

**Responsibility:** _(synthesis failed: claude CLI exited with code 1: (empty stderr))_

## Module: guardrails

**Path:** `backend/src/modules/guardrails`
**Files:** 6 (1 tests)
**Key exports:** `GuardrailRejectedError`, `GuardrailRejectionCode`, `GuardrailsModule`, `GUARDRAIL_PRESETS`, `GuardrailPreset`, `GuardrailPresetName`, `GuardrailsService`, `guardInput`, +2 more
**Depends on (internal):** common
**Depended on by (internal):** hints, questions, snapshots
**External:** `@nestjs/common`

**Responsibility:** _(synthesis failed: claude CLI exited with code 1: (empty stderr))_

## Module: hints

**Path:** `backend/src/modules/hints`
**Files:** 7 (2 tests)
**Key exports:** `HINT_MESSAGE_MAX_CHARS`, `SendHintDto`, `HintsController`, `HintsModule`, `HINT_SYSTEM_PROMPT`, `AIInteractionsRepository`, `HintsService`
**Depends on (internal):** auth, llm, guardrails, session-read, snapshots, config, database, throttling
**Depended on by (internal):** _root, evaluations
**External:** `@nestjs/common`, `@prisma/client`, `@nestjs/swagger`, `@nestjs/throttler`, `class-validator`

**Responsibility:** _(synthesis failed: claude CLI exited with code 1: (empty stderr))_

## Module: llm

**Path:** `backend/src/modules/llm`
**Files:** 13 (7 tests)
**Key exports:** `OLLAMA_REQUEST_TIMEOUT_MS`, `LLM_ENV`, `CLAUDE_CLI_TIMEOUT_MS`, `CLAUDE_CLI_DEFAULT_BIN`, `ChatRole`, `LlmModule`, `AnthropicProvider`, `ClaudeCliProvider`, +19 more
**Depends on (internal):** cost-cap
**Depended on by (internal):** _root, eval-harness, evaluations, hints, mentor, signal-mentor
**External:** `@nestjs/common`, `@nestjs/config`, `@anthropic-ai/sdk`, `node:child_process`

**Responsibility:** _(synthesis failed: claude CLI exited with code 1: (empty stderr))_

## Module: mentor

**Path:** `backend/src/modules/mentor`
**Files:** 8 (1 tests)
**Key exports:** `MentorAgent`, `GenerateMentorDto`, `MentorController`, `MentorModule`, `buildMentorPrompt`, `flattenForAudit`, `BuiltMentorPrompt`, `MentorRepository`, +5 more
**Depends on (internal):** evaluations, auth, common, llm, phase-tagger, session-read, snapshots, config, database, throttling
**Depended on by (internal):** _root, eval-harness
**External:** `@nestjs/common`, `@nestjs/config`, `@nestjs/event-emitter`, `@nestjs/swagger`, `@nestjs/throttler`

**Responsibility:** _(synthesis failed: claude CLI exited with code 1: (empty stderr))_

## Module: phase-tagger

**Path:** `backend/src/modules/phase-tagger`
**Files:** 3
**Key exports:** `PhaseTaggerModule`, `PhaseTaggerService`, `Phase`, `TaggedEntries`
**Depends on (internal):** artifacts
**Depended on by (internal):** _root, common, dashboard, eval-harness, evaluations, mentor, signal-mentor
**External:** `@nestjs/common`

**Responsibility:** _(synthesis failed: claude CLI exited with code 1: (empty stderr))_

## Module: questions

**Path:** `backend/src/modules/questions`
**Files:** 5 (1 tests)
**Key exports:** `CreateQuestionDto`, `StartAttemptDto`, `QuestionsController`, `QuestionsModule`, `QuestionsRepository`, `QuestionsService`
**Depends on (internal):** auth, guardrails, sessions, common, evaluations, snapshots, database, throttling
**Depended on by (internal):** _root
**External:** `@nestjs/common`, `@prisma/client`, `@nestjs/config`, `@nestjs/swagger`, `@nestjs/throttler`

**Responsibility:** _(synthesis failed: claude CLI exited with code 1: (empty stderr))_

## Module: session-read

**Path:** `backend/src/modules/session-read`
**Files:** 2 (1 tests)
**Key exports:** `SessionReadService`, `SessionReadModule`
**Depends on (internal):** database
**Depended on by (internal):** _root, evaluations, hints, mentor, signal-mentor
**External:** `@nestjs/common`

**Responsibility:** _(synthesis failed: claude CLI exited with code 1: (empty stderr))_

## Module: sessions

**Path:** `backend/src/modules/sessions`
**Files:** 7 (2 tests)
**Key exports:** `CreateSessionDto`, `EndSessionDto`, `SessionEndStatus`, `SessionsController`, `SessionsRepository`, `SessionsService`, `EndSessionResult`, `RedactedSession`, +3 more
**Depends on (internal):** auth, common, evaluations, database
**Depended on by (internal):** _root, questions
**External:** `@nestjs/common`, `@prisma/client`, `class-validator`, `@nestjs/config`, `@nestjs/swagger`

**Responsibility:** _(synthesis failed: claude CLI exited with code 1: (empty stderr))_

## Module: signal-mentor

**Path:** `backend/src/modules/signal-mentor`
**Files:** 8 (2 tests)
**Key exports:** `SignalMentorAgent`, `GenerateSignalMentorDto`, `SignalMentorController`, `buildSignalMentorPrompt`, `flattenForAudit`, `buildAnnotationsTool`, `SUBMIT_ANNOTATIONS_TOOL_NAME`, `BuiltSignalMentorPrompt`, +7 more
**Depends on (internal):** evaluations, auth, common, llm, phase-tagger, session-read, snapshots, config, database, throttling
**Depended on by (internal):** _root, eval-harness
**External:** `@nestjs/common`, `@nestjs/config`, `@nestjs/event-emitter`, `@nestjs/swagger`, `@nestjs/throttler`

**Responsibility:** _(synthesis failed: claude CLI exited with code 1: (empty stderr))_

## Module: snapshots

**Path:** `backend/src/modules/snapshots`
**Files:** 6 (2 tests)
**Key exports:** `CaptureSnapshotDto`, `SnapshotsController`, `SnapshotsRepository`, `SnapshotsService`, `SnapshotsModule`, `SnapshotArtifacts`
**Depends on (internal):** auth, guardrails, common, database
**Depended on by (internal):** _root, artifacts, evaluations, hints, mentor, questions, signal-mentor
**External:** `@nestjs/common`, `@prisma/client`, `@nestjs/swagger`, `class-transformer`, `class-validator`

**Responsibility:** _(synthesis failed: claude CLI exited with code 1: (empty stderr))_

## Module: throttling

**Path:** `backend/src/modules/throttling`
**Files:** 3 (1 tests)
**Key exports:** `LLM_POST_THROTTLE`, `AUTH_BRUTE_FORCE_THROTTLE`, `ThrottlingModule`, `UserOrIpThrottlerGuard`
**Depends on (internal):** auth
**Depended on by (internal):** _root, auth, evaluations, hints, mentor, questions, signal-mentor
**External:** `@nestjs/throttler`, `@nestjs/common`

**Responsibility:** _(synthesis failed: claude CLI exited with code 1: (empty stderr))_

## Module: common

**Path:** `backend/src/common`
**Files:** 7 (2 tests)
**Key exports:** `ShutdownInProgressError`, `BackgroundTaskTimeoutError`, `BackgroundTaskTracker`, `TrackOptions`, `TaskFailureRecord`, `BackgroundTaskStats`, `CommonModule`, `EvaluationCompletedEvent`, +16 more
**Depends on (internal):** phase-tagger
**Depended on by (internal):** _root, build-sessions, evaluations, guardrails, mentor, questions, sessions, signal-mentor, snapshots
**External:** `@nestjs/common`, `@nestjs/config`, `class-transformer`, `class-validator`, `express`

**Responsibility:** _(synthesis failed: claude CLI exited with code 1: (empty stderr))_

## Module: config

**Path:** `backend/src/config`
**Files:** 2 (1 tests)
**Key exports:** `default`, `contextWindowFor`, `inputTokenWarnThresholdFor`, `planMdCapFor`, `AGENTS_CONFIG`
**Depends on (internal):** _none_
**Depended on by (internal):** evaluations, hints, mentor, signal-mentor
**External:** _none_

**Responsibility:** _(synthesis failed: claude CLI exited with code 1: (empty stderr))_

## Module: database

**Path:** `backend/src/database`
**Files:** 2
**Key exports:** `DatabaseModule`, `PrismaService`
**Depends on (internal):** _none_
**Depended on by (internal):** _root, artifacts, auth, build-sessions, cost-cap, dashboard, evaluations, hints, mentor, questions, scripts, session-read, sessions, signal-mentor, snapshots
**External:** `@nestjs/common`, `@prisma/client`

**Responsibility:** _(synthesis failed: claude CLI exited with code 1: (empty stderr))_

## Module: _root

**Path:** `backend/src`
**Files:** 2
**Key exports:** `AppModule`
**Depends on (internal):** auth, common, throttling, artifacts, build-sessions, dashboard, database, evaluations, hints, llm, mentor, phase-tagger, questions, session-read, sessions, signal-mentor, snapshots
**Depended on by (internal):** eval-harness, scripts
**External:** `@nestjs/common`, `@nestjs/config`, `@nestjs/core`, `@nestjs/event-emitter`, `@nestjs/swagger`

**Responsibility:** _(synthesis failed: claude CLI exited with code 1: (empty stderr))_

## Module: eval-harness

**Path:** `backend/eval-harness`
**Files:** 5
**Key exports:** `compareResult`, `loadFixtures`, `validateAgainstRubric`, `printConsoleReport`, `writeJsonReport`, `FixtureExpectation`, `FixtureHint`, `FixtureBuildEvent`, +9 more
**Depends on (internal):** evaluations, mentor, signal-mentor, _root, llm, phase-tagger
**Depended on by (internal):** _none_
**External:** `path`, `fs`, `@nestjs/config`, `@nestjs/core`, `js-yaml`

**Responsibility:** _(synthesis failed: claude CLI exited with code 1: (empty stderr))_

## Module: scripts

**Path:** `backend/scripts`
**Files:** 1
**Key exports:** _none_
**Depends on (internal):** _root, database
**Depended on by (internal):** _none_
**External:** `@nestjs/core`, `@prisma/client`

**Responsibility:** _(synthesis failed: claude CLI exited with code 1: (empty stderr))_
