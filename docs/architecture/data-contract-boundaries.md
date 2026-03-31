# Data Contract Boundaries

This document defines where data contracts live, who owns them, and where runtime validation must happen.

## Core Rules

- A shared type has exactly one canonical definition.
- If a type crosses workspaces, it belongs in `shared`; otherwise it stays local to its workspace.
- Use only published shared barrels: `@masswhisper/shared/domain`, `@masswhisper/shared/dtos`, `@masswhisper/shared/primitives`.
- Barrels are public entrypoints, not the canonical source file.

## Ownership

- `shared/domain` owns canonical business contracts that cross workspace boundaries, along with their runtime schemas.
- `shared/primitives` owns reusable validated scalar building blocks shared across contracts and workspaces.
- `shared/dtos` owns non-canonical serialized transport shapes: projections, API payloads, static payloads, and other boundary-facing views.

- `backend/domain/entities` owns backend-only business objects used by the pipeline.
- `backend/domain/value-objects` owns backend-only validated persisted shapes and historical aggregates. `PipelineSnapshot` lives here as a backend-owned historical aggregate and storage contract.

- `backend/application` owns orchestration, use cases, and backend-side assembly of projections or DTOs, but it does not own shared contract definitions.
- `backend/interface` owns protocol adaptation: request parsing, response shaping, and boundary-specific mapping.
- `backend/cli` owns supported backend entrypoints and process-level orchestration.
- `backend/tools` owns one-off operational, migration, or maintenance scripts. Tools must never define canonical application contracts or become the source of truth for them.

## Current Decisions

- `SentimentProfile` stays backend-owned because it is pipeline-internal and does not cross workspace boundaries.
- `AggregatedSentimentProfile` stays backend-owned; the shared read-side contract is `SentimentHistoryDto`.
- `SnapshotQueryPort` stays backend-owned even when it returns shared contracts.
- Move a backend-owned type to `shared` only when the same shape becomes a stable cross-workspace contract.

## Runtime Validation Boundaries

Validate untrusted data at entry boundaries with Zod:

- env and config loading
- HTTP input
- external API payloads
- LLM output
- persisted JSON or schemaless database payloads on load
- static file and frontend API payload loading
- replay input loading

When storage does not enforce schema constraints, adapters must revalidate on load. Never cast untrusted payloads blindly.

## Replay

Replay accepts only the current normalized input shape:

`{ id?: string; createdAt: IsoDateString; fetchedItems: Item[] }`

Rules:

- Replay is current-format only.
- Replay provides no implicit legacy compatibility.
- Legacy or raw inputs must be transformed before replay.
- Replay validates input before execution.
