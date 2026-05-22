# frontend module map

_Generated 2026-05-20T18:37:53.826Z (model: claude-sonnet-4-6)_

## Summary

- **26** modules
- **45** source files + **0** test files
- **24** modules with no inbound internal deps (entry points / leaves)
- **26** module(s) had a responsibility-synthesis failure

## Module: pages/ActiveSession

**Path:** `frontend/src/pages/ActiveSession`
**Files:** 1
**Key exports:** `ActiveSessionPage`
**Depends on (internal):** _none_
**Depended on by (internal):** _none_
**External:** `@/services`, `@/components`, `@/lib`, `@/store`, `@components/layout`

**Responsibility:** _(synthesis failed: claude CLI exited with code 1: (empty stderr))_

## Module: pages/Login

**Path:** `frontend/src/pages/Login`
**Files:** 1
**Key exports:** `LoginPage`
**Depends on (internal):** _none_
**Depended on by (internal):** _none_
**External:** `@/lib`, `@/services`, `@/store`, `@tanstack/react-query`, `react`

**Responsibility:** _(synthesis failed: claude CLI exited with code 1: (empty stderr))_

## Module: pages/QuestionDetail

**Path:** `frontend/src/pages/QuestionDetail`
**Files:** 1
**Key exports:** `QuestionRedirectPage`
**Depends on (internal):** _none_
**Depended on by (internal):** _none_
**External:** `@/lib`, `@/services`, `@/store`, `@/types`, `@tanstack/react-query`

**Responsibility:** _(synthesis failed: claude CLI exited with code 1: (empty stderr))_

## Module: pages/SessionResults

**Path:** `frontend/src/pages/SessionResults`
**Files:** 1
**Key exports:** `SessionResultsPage`
**Depends on (internal):** _none_
**Depended on by (internal):** _none_
**External:** `@/services`, `@/components`, `@/types`, `@/lib`, `@/store`

**Responsibility:** _(synthesis failed: claude CLI exited with code 1: (empty stderr))_

## Module: pages/SessionStart

**Path:** `frontend/src/pages/SessionStart`
**Files:** 1
**Key exports:** `SessionStartPage`
**Depends on (internal):** _none_
**Depended on by (internal):** _none_
**External:** `@/lib`, `@/services`, `@/store`, `@/types`, `@tanstack/react-query`

**Responsibility:** _(synthesis failed: claude CLI exited with code 1: (empty stderr))_

## Module: pages/Signup

**Path:** `frontend/src/pages/Signup`
**Files:** 1
**Key exports:** `SignupPage`
**Depends on (internal):** _none_
**Depended on by (internal):** _none_
**External:** `@/lib`, `@/services`, `@/store`, `@tanstack/react-query`, `react`

**Responsibility:** _(synthesis failed: claude CLI exited with code 1: (empty stderr))_

## Module: services/api

**Path:** `frontend/src/services/api.ts`
**Files:** 1
**Key exports:** `api`
**Depends on (internal):** _none_
**Depended on by (internal):** services/auth, services/buildSessions, services/costCap, services/dashboard, services/evaluations, services/hints, services/mentor, services/questions, services/rubrics, services/sessions, services/signalMentor, services/snapshots
**External:** `@/store`, `axios`

**Responsibility:** _(synthesis failed: claude CLI exited with code 1: (empty stderr))_

## Module: services/auth

**Path:** `frontend/src/services/auth.service.ts`
**Files:** 1
**Key exports:** `authService`, `SignupRequest`, `LoginRequest`, `AuthResponse`
**Depends on (internal):** services/api
**Depended on by (internal):** _none_
**External:** `@/store`

**Responsibility:** _(synthesis failed: claude CLI exited with code 1: (empty stderr))_

## Module: services/buildSessions

**Path:** `frontend/src/services/buildSessions.service.ts`
**Files:** 1
**Key exports:** `buildSessionsService`
**Depends on (internal):** services/api
**Depended on by (internal):** _none_
**External:** `@/types`

**Responsibility:** _(synthesis failed: claude CLI exited with code 1: (empty stderr))_

## Module: services/costCap

**Path:** `frontend/src/services/costCap.service.ts`
**Files:** 1
**Key exports:** `costCapService`, `DailySpend`
**Depends on (internal):** services/api
**Depended on by (internal):** _none_
**External:** _none_

**Responsibility:** _(synthesis failed: claude CLI exited with code 1: (empty stderr))_

## Module: services/dashboard

**Path:** `frontend/src/services/dashboard.service.ts`
**Files:** 1
**Key exports:** `dashboardService`
**Depends on (internal):** services/api
**Depended on by (internal):** _none_
**External:** `@/types`

**Responsibility:** _(synthesis failed: claude CLI exited with code 1: (empty stderr))_

## Module: services/evaluations

**Path:** `frontend/src/services/evaluations.service.ts`
**Files:** 1
**Key exports:** `evaluationsService`
**Depends on (internal):** services/api
**Depended on by (internal):** _none_
**External:** `@/types`

**Responsibility:** _(synthesis failed: claude CLI exited with code 1: (empty stderr))_

## Module: services/hints

**Path:** `frontend/src/services/hints.service.ts`
**Files:** 1
**Key exports:** `hintsService`, `AIInteraction`
**Depends on (internal):** services/api
**Depended on by (internal):** _none_
**External:** _none_

**Responsibility:** _(synthesis failed: claude CLI exited with code 1: (empty stderr))_

## Module: services/mentor

**Path:** `frontend/src/services/mentor.service.ts`
**Files:** 1
**Key exports:** `mentorService`
**Depends on (internal):** services/api
**Depended on by (internal):** _none_
**External:** `@/types`

**Responsibility:** _(synthesis failed: claude CLI exited with code 1: (empty stderr))_

## Module: services/questions

**Path:** `frontend/src/services/questions.service.ts`
**Files:** 1
**Key exports:** `questionsService`
**Depends on (internal):** services/api
**Depended on by (internal):** _none_
**External:** `@/types`

**Responsibility:** _(synthesis failed: claude CLI exited with code 1: (empty stderr))_

## Module: services/rubrics

**Path:** `frontend/src/services/rubrics.service.ts`
**Files:** 1
**Key exports:** `rubricsService`
**Depends on (internal):** services/api
**Depended on by (internal):** _none_
**External:** `@/types`

**Responsibility:** _(synthesis failed: claude CLI exited with code 1: (empty stderr))_

## Module: services/sessions

**Path:** `frontend/src/services/sessions.service.ts`
**Files:** 1
**Key exports:** `sessionsService`, `EndSessionResult`
**Depends on (internal):** services/api
**Depended on by (internal):** _none_
**External:** `@/types`

**Responsibility:** _(synthesis failed: claude CLI exited with code 1: (empty stderr))_

## Module: services/signalMentor

**Path:** `frontend/src/services/signalMentor.service.ts`
**Files:** 1
**Key exports:** `signalMentorService`
**Depends on (internal):** services/api
**Depended on by (internal):** _none_
**External:** `@/types`

**Responsibility:** _(synthesis failed: claude CLI exited with code 1: (empty stderr))_

## Module: services/snapshots

**Path:** `frontend/src/services/snapshots.service.ts`
**Files:** 1
**Key exports:** `snapshotsService`, `SnapshotArtifacts`, `Snapshot`
**Depends on (internal):** services/api
**Depended on by (internal):** _none_
**External:** _none_

**Responsibility:** _(synthesis failed: claude CLI exited with code 1: (empty stderr))_

## Module: components

**Path:** `frontend/src/components`
**Files:** 10
**Key exports:** `BuildPhaseSection`, `HintChatPanel`, `AppLayout`, `DailySpendBadge`, `DAILY_SPEND_QUERY_KEY`, `MarkdownView`, `MARKDOWN_COMPONENTS`, `MentorArtifactView`, +5 more
**Depends on (internal):** _none_
**Depended on by (internal):** _none_
**External:** `react`, `@/types`, `@/services`, `@/lib`, `@/store`

**Responsibility:** _(synthesis failed: claude CLI exited with code 1: (empty stderr))_

## Module: hooks

**Path:** `frontend/src/hooks`
**Files:** 1
**Key exports:** `useSnapshotTimer`
**Depends on (internal):** _none_
**Depended on by (internal):** _none_
**External:** `react`

**Responsibility:** _(synthesis failed: claude CLI exited with code 1: (empty stderr))_

## Module: lib

**Path:** `frontend/src/lib`
**Files:** 2
**Key exports:** `extractApiError`, `extractGuardrailError`, `formatGuardrailMessage`, `extractRateLimitError`, `formatRateLimitMessage`, `extractCostCapError`, `formatCostCapMessage`, `describeError`, +9 more
**Depends on (internal):** _none_
**Depended on by (internal):** _none_
**External:** _none_

**Responsibility:** _(synthesis failed: claude CLI exited with code 1: (empty stderr))_

## Module: store

**Path:** `frontend/src/store`
**Files:** 2
**Key exports:** `useAuthStore`, `AuthUser`, `computeElapsedMs`, `useSessionStore`
**Depends on (internal):** _none_
**Depended on by (internal):** _none_
**External:** `zustand`

**Responsibility:** _(synthesis failed: claude CLI exited with code 1: (empty stderr))_

## Module: types

**Path:** `frontend/src/types`
**Files:** 8
**Key exports:** `MintedBuildToken`, `BuildEventsPerFile`, `BuildEventsSummary`, `TrendPoint`, `HeatmapCell`, `WeaknessSummary`, `SignalResult`, `PhaseEvaluation`, +27 more
**Depends on (internal):** _none_
**Depended on by (internal):** _none_
**External:** _none_

**Responsibility:** _(synthesis failed: claude CLI exited with code 1: (empty stderr))_

## Module: routes

**Path:** `frontend/src/routes`
**Files:** 1
**Key exports:** `router`
**Depends on (internal):** _none_
**Depended on by (internal):** _root
**External:** `@components/layout`, `@components/PublicOnly`, `@components/RequireAuth`, `@pages/ActiveSession`, `@pages/Login`

**Responsibility:** _(synthesis failed: claude CLI exited with code 1: (empty stderr))_

## Module: _root

**Path:** `frontend/src`
**Files:** 2
**Key exports:** _none_
**Depends on (internal):** routes
**Depended on by (internal):** _none_
**External:** `@tanstack/react-query`, `react`, `react-dom`, `react-router-dom`

**Responsibility:** _(synthesis failed: claude CLI exited with code 1: (empty stderr))_
