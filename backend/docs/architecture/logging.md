# LOGGING ARCHITECTURAL GUIDELINE

## INDEX

- **TL;DR** - Quick summary
- **CORE PRINCIPLES** - Fundamental rules and trade-offs
- **RULES BY LAYER** - Per layer responsibilities
- **DETAILS** - Secondary building blocks / implementation notes

## TL;DR

1. Root logger created at entrypoint
2. Entrypoint creates child with `traceId` + cmd; interface adds `requestId` + path per-request
3. Scoped children created for interface; adapters/usecases receive logger per-call
4. Operations execute and log at boundaries with structured context
5. Errors logged: DEBUG (adapters), ERROR/WARN (usecases), WARN (interface validation)
6. Logger applies full redaction, emits structured JSON

## CORE PRINCIPLES

- Use structured logging with `LoggerPort`; emit `{ time, level, msg, context, error? }` as JSON
- Create `child()` only at boundary transitions and pass down (never create global instances)
- Log canonically in usecases (ERROR/WARN); diagnostically in adapters (DEBUG only)
- Include `traceId` + `errorId` + `code` when logging `AppError`; add `requestId` at interface layer
- Apply full redaction at emission (deep traversal and circular-safe)
- Level by intent: ERROR (infra), WARN (business), INFO (milestone), DEBUG (diagnostic)

## RULES BY LAYER

Defines logging per layer in **responsibility order** (from no logging to orchestration).

```
[lib, domain, adapters] → [application (ports, usecases)] → [interface] → [entrypoints]

┌───────────────────────────────────────────────────────────────────────────────────────┐
│ Layer       │ Receives          │ Creates child               │ Logs                  │
├───────────────────────────────────────────────────────────────────────────────────────┤
│ lib         │ no                │ no                          │ no                    │
│ domain      │ no                │ no                          │ no                    │
│ adapters    │ logger per call   │ per-operation if multi-step │ DEBUG only            │
│ usecases    │ pre-scoped child  │ per-sub-usecase if nested   │ ERROR/WARN/INFO/DEBUG │
│ interface   │ pre-scoped child  │ +requestId, +path           │ WARN/INFO/DEBUG       │
│ entrypoints │ rootLogger        │ +traceId, +cmd              │ ERROR/WARN/INFO/DEBUG │
└───────────────────────────────────────────────────────────────────────────────────────┘
```

Each layer section below uses these keys:

- **Level** — log severity and intent (`ERROR`, `WARN`, `INFO`, `DEBUG`) _→ see Logging Strategy_
- **When** — when logs are emitted
- **What to Log** — expected `context` and `error` content for structured logs _→ see Log Entry Structure_
- **Pattern** — sample code snippet showing how to log
- **Rules** — important details _→ see Details_

### Logging in Adapters

**Level:** DEBUG

**When:**

- Caught external exceptions from API/DB/FS (DEBUG)

**What to log:**

- Context: `{ adapter, status? }`
- Error: normalized exception

**Pattern:**

```ts
// Adapter methods receive logger as FIRST parameter
async fetchData(logger: LoggerPort, params: Params): Promise<Result<Data, PortError>> {
  try {
    const data = await this.httpClient.get('/data', params);
    return ok(data);
  } catch (e) {
    const norm = normalizeError(e);
    logger.debug('API failed', { adapter: 'OpenAI', status: 503 }, norm);
    return err({ kind: 'NetworkError', meta: { adapter: 'OpenAI', cause: norm } });
  }
}
```

**Rules:**

- Adapters receive logger as first parameter in every method (not at construction)
- Log ONLY at DEBUG level
- Never log `AppError` (adapters don't know about it)
- Always normalize external exceptions before logging
- Exception: Lifecycle methods (init/close/healthCheck) also receive logger as parameter

### Logging in Usecases

**Level:** ERROR/WARN/INFO/DEBUG

**When:**

- After mapping `PortError`/`LibError` → `AppError` (ERROR)
- After mapping `DomainError` → `AppError` (WARN)
- After successful operation completion (INFO)
- During operation execution with diagnostic context (DEBUG)

```
[error occurs] → [map to AppError] → [log with errorId] → [return err(appError)]
```

**What to log:**

- Context: `{ traceId, errorId?, code?, adapter?, attempts?, userId?, entity? }`
- Error: raw structured error for ERROR/WARN only

**Pattern:**

```ts
// Infrastructure error
const appError = mapToAppError(result.error);
logger.error(
  'Infra failure',
  { errorId: appError.errorId, code: appError.code },
  result.error,
);
return err(appError);

// Business error
logger.warn(
  'Business violation',
  { errorId: appError.errorId, code: appError.code },
  result.error,
);

// Success milestone
logger.info('User created', { userId });

// Unknown error (should never happen)
const norm = normalizeError(result.error);
logger.error('Unmapped error', { errorId: generateErrorId() }, norm);
assertNever(result.error);
```

**Rules:**

- Emit canonical error log (one ERROR or WARN per error trajectory)
- Always include errorId and code when logging `AppError`
- Include raw structured error (`PortError`/`DomainError`/`LibError`) as error parameter

### Logging in Interface

**Level:** WARN/INFO/DEBUG

**When:**

- After mapping `InterfaceError` → `AppError` for validation/serialization failures (WARN)
- After successful request parsing (INFO)
- During payload inspection or serialization (DEBUG)

**What to log:**

- Context: `{ traceId, errorId?, code?, path?, method? }`
- Error: `InterfaceError` (for validation failures only)

**Pattern:**

```ts
// WARN - Validation failure
if (inputResult.isErr()) {
  const appError = mapInterfaceErrorToAppError(inputResult.error);
  logger.warn('Invalid request', {
    errorId: appError.errorId,
    code: appError.code,
  });
  return toHttpResponse(appError);
}

// INFO - Request parsing
logger.info('Request parsed', { method: 'POST', path: '/api/v1/users' });

// DEBUG - Payload inspection
logger.debug('Request payload', { bodySize: req.body.length });
```

**Rules:**

- Log validation failures only after mapping to `AppError`
- Never log request bodies without sanitization
- Include requestId in all logs

### Logging in Entrypoints

**Level:** ERROR/WARN/INFO/DEBUG

**When:**

- Caught unexpected exceptions or startup failures (ERROR)
- After strategic retry exhaustion (WARN)
- Before each strategic retry attempt (INFO)
- At startup for configuration and port binding (DEBUG)

**What to log:**

- Context: `{ traceId, errorId?, code?, status?, attempt?, retryAfterMs? }`
- Error: raw exception (for crashes only)

**Pattern:**

```ts
// ERROR - Unexpected crash
catch (e) {
  log.error('Unhandled exception', {}, e);
}

// WARN - Final failure
if (result.status >= 400) {
  log.warn('Request failed', { errorId, code, status });
}

// INFO - Retry attempt
log.info('Retrying request', { attempt: 2, retryAfterMs: 1000 });

// DEBUG - Configuration
log.debug('Server starting', { port: 3000, env: 'production' });
```

**Rules:**

- Safety net for unexpected throws (convert to `AppError` (INTERNAL))
- Log retry attempts at INFO (not ERROR/WARN until final failure)
- Never expose PII in crash logs

## DETAILS

### Type Definitions

#### Logger Contract

```ts
export interface LoggerPort {
  error(msg: string, context?: LogContext, error?: unknown): void;
  warn(msg: string, context?: LogContext, error?: unknown): void;
  info(msg: string, context?: LogContext): void;
  debug(msg: string, context?: LogContext, error?: unknown): void;
  child(context: Partial<LogContext>): LoggerPort;
}
```

**Signature pattern:**

- `msg`: Human-readable message (English, present tense)
- `context`: Structured metadata (traceId, errorId, code, etc.)
- `error`: Raw or normalized error object (optional)

**Error parameter:**

- If `__normalized === true`: Skip `normalizeError()` (already done)
- If `__normalized !== true`: Call `normalizeError()` (safety net)
- ALWAYS apply `applyFullRedaction()` before emission (separate step)

#### Log Entry Structure

All logs follow this canonical shape:

```ts
type LogEntry = {
  time: string; // ISO 8601 timestamp
  level: LogLevel; // ERROR | WARN | INFO | DEBUG
  msg: string; // human-readable message
  context: LogContext; // structured metadata
  error?: NormalizedError; // only for ERROR/WARN with failures
};

type LogContext = {
  // Orchestration (injected by child loggers)
  traceId?: string; // global trace ID (required in usecases/interface/entrypoints)
  requestId?: string; // per-request ID (HTTP/jobs)

  // Scoping (derived from child loggers)
  cmd?: string; // entrypoint command (e.g. 'api', 'worker')
  module?: string; // component (e.g. 'auth', 'reddit-adapter')
  scope?: string; // sub-scope (e.g. 'fetchItems', 'validateToken')

  // Error-specific (only for ERROR/WARN logs)
  errorId?: string; // AppError.errorId (when mapping to AppError)
  code?: ErrorCode; // AppError.code (when mapping to AppError)

  // Operation-specific (optional, non-PII)
  userId?: string; // stable business ID
  adapter?: string; // infra adapter name
  attempt?: number; // retry attempt number
  retryAfterMs?: number; // backoff delay
  [key: string]: unknown; // additional context (non-PII)
};

type NormalizedError = import('../lib/errors').NormalizedError;
```

**Rules:**

- `error` field is **top-level**, NOT nested in `context`
- `error` is **present** for ERROR/WARN logs with failures
- `error` is **optional** for INFO/DEBUG logs (use for diagnostic errors)
- `context.errorId` and `context.code` are **only present** when an `AppError` exists

### Logger Construction

**Root logger creation:**

- Create `rootLogger` via `makeLogger()` at entrypoint
- Configure via env vars (LOG_LEVEL, LOG_FORMAT, LOG_REDACT)
- No global loggers; one rootLogger per process, scoped via children

_Example: Logger hierarchy with context injection_

```
┌─────────────────────────────────────────────────────────────────┐
│ Bootstrap/Configuration                                         │
│ rootLogger = makeLogger()                                       │
│ context: {}                                                     │
└─────────────────────────────────────────────────────────────────┘
  │
  │ const entrypointLogger = rootLogger.child({ cmd: 'api', traceId: 'abc-123' })
  ↓
┌─────────────────────────────────────────────────────────────────┐
│ Entrypoint                                                      │
│ context: { cmd: 'api', traceId: 'abc-123' }                     │
└─────────────────────────────────────────────────────────────────┘
  │
  │ // Dependencies creation - adapters do NOT receive logger at construction
  │ const deps = {
  │   adapter: new PostgresAdapter(pool) // No logger here!
  │ }
  │
  │ // Interface creation - scoped by entrypoint
  │ const interfaceLogger = entrypointLogger.child({ module: 'http-interface' })
  │ const controller = makeReadApiController(interfaceLogger, deps)
  ↓
┌─────────────────────────────────────────────────────────────────┐
│ Interface (factory/class)                                       │
│ context: { cmd: 'api', traceId: 'abc-123', module: 'http-...' } │
└─────────────────────────────────────────────────────────────────┘
  │
  │ // Per-request scoping
  │ const log = interfaceLogger.child({ requestId: 'req-456', path: '/users' })
  ↓
┌─────────────────────────────────────────────────────────────────┐
│ Interface (per-request handler)                                 │
│ context: {                                                      │
│   cmd: 'api',                                                   │
│   traceId: 'abc-123',                                           │
│   module: 'http-interface',                                     │
│   requestId: 'req-456',                                         │
│   path: '/users'                                                │
│ }                                                               │
└─────────────────────────────────────────────────────────────────┘
  │
  │ // Usecase call - scoped by interface
  │ await usecases.createUser(log.child({ scope: 'create-user' }), input)
  ↓
┌─────────────────────────────────────────────────────────────────┐
│ Usecase (function call)                                         │
│ async function createUser(logger: LoggerPort, input: Input)     │
│ context: {                                                      │
│   cmd: 'api',                                                   │
│   traceId: 'abc-123',                                           │
│   module: 'http-interface',                                     │
│   requestId: 'req-456',                                         │
│   path: '/users',                                               │
│   scope: 'create-user'                                          │
│ }                                                               │
└─────────────────────────────────────────────────────────────────┘
  │
  │ // Adapter call - pass the logger with full context
  │ await deps.adapter.save(logger, data)
  ↓
┌─────────────────────────────────────────────────────────────────┐
│ Adapter (method call)                                           │
│ async save(logger: LoggerPort, data: Data)                      │
│ // Inherited context (from caller):                             │
│ context: {                                                      │
│   cmd: 'api',                                                   │
│   traceId: 'abc-123',                                           │
│   module: 'http-interface',                                     │
│   requestId: 'req-456',                                         │
│   path: '/users',                                               │
│   scope: 'create-user'                                          │
│ }                                                               │
│                                                                 │
│ // Adapter adds its own metadata in log calls:                  │
│ logger.debug('Saving record', {                                 │
│   adapter: 'postgres-adapter',  ← Adapter-specific context      │
│   table: 'users',                                               │
│   id: data.id                                                   │
│ });                                                             │
└─────────────────────────────────────────────────────────────────┘
```

> Note that context merges via `Object.assign` (last write wins).

**Principles: Caller scopes → Callee receives**

- Entrypoint scopes interface at bootstrap
- Interface scopes per-request and usecase calls
- Usecases receive logger per-call from interface
- Adapters receive logger per-call from usecases (NOT at construction)

**Naming conventions:**

- `rootLogger` = result of `makeLogger` (factory).
- `logger` = functions/constructors argument.
- `log` = child declared inside a function/method.

**Scoping conventions:**

- `cmd`: entrypoint command (api, worker)
- `module`: layer-level component (interface, adapter)
- `scope` = sub-operation within a component (usecase, function)
- `requestId`: per-request ID (HTTP/jobs)
- `traceId`: global trace ID (CLI/HTTP/jobs)
- `adapter`: adapter name

**Conflict resolution:**

- Context merges via `Object.assign`; last write wins
- Avoid conflicting keys between parent and child

### Logging Strategy

**Critical: Error Log Ownership:**
_Canonical error log_ = The single authoritative ERROR or WARN emitted by a usecase when mapping to `AppError`.

- Contains: errorId, code, traceId, raw structured error
- Emitted once per error trajectory

_Operational summary_ = Optional final WARN at entrypoint after retry exhaustion.

- Contains: same errorId, traceId (for correlation)
- Purpose: Operational visibility (retries exhausted)
- This is NOT a duplicate canonical log

_Example: Canonical VS Summary Logs_

```
Scenario: API call fails after strategic retries

┌──────────────────────────────────────────────────────────────────┐
│ 1. Usecase logs canonical error (first occurrence)               │
└──────────────────────────────────────────────────────────────────┘

{
  "time": "2025-01-15T10:00:00.123Z",
  "level": "ERROR",  ← Canonical error log
  "msg": "Infra failure",
  "context": {
    "traceId": "abc-123",
    "errorId": "err_xyz789",      ← Generated here
    "code": "UNAVAILABLE",
    "adapter": "OpenAI",
    "userId": "user_42"
  },
  "error": {  ← Full diagnostic details
    "kind": "NetworkError",
    "meta": {
      "adapter": "OpenAI",
      "status": 503,
      "retry": {
        "attempts": 3,
        "lastStatus": 503,
        "backoffSummary": "100-200-400"
      },
      "cause": {
        "name": "FetchError",
        "message": "Service unavailable",
        "truncatedStack": "..."
      }
    }
  }
}

┌──────────────────────────────────────────────────────────────────┐
│ 2. Entrypoint logs operational summary (after retries)           │
└──────────────────────────────────────────────────────────────────┘

{
  "time": "2025-01-15T10:00:02.987Z",
  "level": "WARN",  ← Operational summary
  "msg": "Request failed",
  "context": {
    "traceId": "abc-123",         ← Same traceId
    "errorId": "err_xyz789",      ← Same errorId (for correlation)
    "code": "UNAVAILABLE",        ← Same code
    "status": 503,
    "attempts": 3,
    "totalDurationMs": 2864
  }
  // No "error" field - not a diagnostic log
}

┌──────────────────────────────────────────────────────────────────┐
│ Key Differences                                                  │
├──────────────────────────────────────────────────────────────────┤
│ Canonical (ERROR in usecase):                                    │
│   - Full error object with cause chain                           │
│   - Diagnostic metadata (adapter, retry details)                 │
│   - First occurrence timestamp                                   │
│   - Purpose: Root cause analysis                                 │
│                                                                  │
│ Summary (WARN in entrypoint):                                    │
│   - No error object                                              │
│   - Operational metadata (attempts, duration)                    │
│   - Final timestamp after retries                                │
│   - Purpose: SLA monitoring, alerting                            │
│   - Links to canonical via errorId + traceId                     │
└──────────────────────────────────────────────────────────────────┘
```

_Why both logs?_

- Canonical ERROR: "What went wrong?" (for developers)
- Summary WARN: "Did the operation succeed?" (for ops/monitoring)
- Correlation: Search logs by errorId to see both perspectives

**Decision Matrix:**

```
┌────────────────────────────────────────────────────────────────────────┐
│ Situation              │ Layer      │ Level │ Has errorId? │ Action    │
├────────────────────────────────────────────────────────────────────────┤
│ External exception     │ adapter    │ DEBUG │ no           │ normalize │
│ Port/Lib/Domain error  │ usecase    │ E/W   │ yes (new)    │ canonical │
│ Validation failure     │ interface  │ WARN  │ yes (new)    │ map+log   │
│ Retry exhausted        │ entrypoint │ WARN  │ yes (same)   │ summary   │
│ Unexpected throw       │ entrypoint │ ERROR │ yes (new)    │ safety    │
│ Success milestone      │ usecase    │ INFO  │ no           │ track     │
│ Diagnostic event       │ adapter    │ DEBUG │ no           │ trace     │
└────────────────────────────────────────────────────────────────────────┘

Legend:
- E/W: ERROR (infra failures) or WARN (business violations)
- canonical: single authoritative error log with full context
- summary: operational visibility (correlates via same errorId)
- safety: convert unmapped throws to AppError(INTERNAL)
```

_Example: Complete Error Flow_

```
1. Usecase calls adapter with logger
   ↓
┌──────────────────────────────────────────────────────────────────┐
│ Usecase (GenerateContent)                                        │
├──────────────────────────────────────────────────────────────────┤
│ // Pass logger to adapter - includes requestId, scope            │
│ const result = await deps.openai.generate(logger, prompt);       │
└──────────────────────────────────────────────────────────────────┘
   ↓
┌──────────────────────────────────────────────────────────────────┐
│ Adapter (OpenAI)                                                 │
├──────────────────────────────────────────────────────────────────┤
│ async generate(logger: LoggerPort, prompt: string) {             │
│   try {                                                          │
│     const response = await this.client.post('/generate', {...}); │
│     logger.debug('API succeeded', { adapter: 'OpenAI' });        │
│     return ok(response.data);                                    │
│   } catch (e) {                                                  │
│     const norm = normalizeError(e);                              │
│     logger.debug('API failed', {                                 │
│       adapter: 'OpenAI',                                         │
│       status: 503                                                │
│     }, norm);                                                    │
│     return err({                                                 │
│       kind: 'NetworkError',                                      │
│       meta: { adapter: 'OpenAI', cause: norm }                   │
│     });                                                          │
│   }                                                              │
│ }                                                                │
└──────────────────────────────────────────────────────────────────┘
   ↓ return PortError

2. Usecase receives PortError
   ↓
┌──────────────────────────────────────────────────────────────────┐
│ Usecase (GenerateContent)                                        │
├──────────────────────────────────────────────────────────────────┤
│ if (result.isErr()) {                                            │
│   const appError = mapToAppError(result.error);                  │
│   logger.error('Infra failure', {                                │
│     errorId: appError.errorId,  // e.g. 'err_xyz789'             │
│     code: appError.code,        // 'UNAVAILABLE'                 │
│     adapter: 'OpenAI'                                            │
│   }, result.error); // ← Raw PortError logged                    │
│   return err(appError);                                          │
│ }                                                                │
└──────────────────────────────────────────────────────────────────┘
   ↓ return AppError
3. Entrypoint applies strategic retries
   ↓
┌──────────────────────────────────────────────────────────────────┐
│ Entrypoint (HTTP)                                                │
├──────────────────────────────────────────────────────────────────┤
│ // Attempt 1: fails with AppError(UNAVAILABLE)                   │
│ logger.info('Retrying request', {                                │
│   attempt: 2,                                                    │
│   retryAfterMs: 500                                              │
│ });                                                              │
│                                                                  │
│ // Attempt 2: fails again                                        │
│ // Attempt 3: final failure                                      │
│                                                                  │
│ logger.warn('Request failed', {                                  │
│   errorId: 'err_xyz789', // ← Same errorId!                      │
│   code: 'UNAVAILABLE',                                           │
│   status: 503,                                                   │
│   attempts: 3                                                    │
│ });                                                              │
└──────────────────────────────────────────────────────────────────┘
```

_Example: Resulting logs (chronological)_

```
{
  "time": "2025-01-15T10:00:00Z",
  "level": "DEBUG",
  "msg": "API failed",
  "context": { "adapter": "OpenAI", "status": 503 },
  "error": { "name": "FetchError", "message": "Service unavailable" }
}

{
  "time": "2025-01-15T10:00:00Z",
  "level": "ERROR",  ← Canonical error log
  "msg": "Infra failure",
  "context": {
    "traceId": "abc-123",
    "errorId": "err_xyz789",
    "code": "UNAVAILABLE",
    "adapter": "OpenAI"
  },
  "error": {
    "kind": "NetworkError",
    "meta": { "adapter": "OpenAI", "cause": {...} }
  }
}

{
  "time": "2025-01-15T10:00:00Z",
  "level": "INFO",
  "msg": "Retrying request",
  "context": { "traceId": "abc-123", "attempt": 2, "retryAfterMs": 500 }
}

{
  "time": "2025-01-15T10:00:01Z",
  "level": "INFO",
  "msg": "Retrying request",
  "context": { "traceId": "abc-123", "attempt": 3, "retryAfterMs": 1000 }
}

{
  "time": "2025-01-15T10:00:02Z",
  "level": "WARN",  ← Operational summary
  "msg": "Request failed",
  "context": {
    "traceId": "abc-123",
    "errorId": "err_xyz789",  ← Same errorId for correlation
    "code": "UNAVAILABLE",
    "status": 503,
    "attempts": 3
  }
}
```

### Error Handling

#### Normalization

The logger handles error normalization in two stages:

**Stage 1: Capture (in adapters)**

- Adapters call `normalizeError()` when catching external errors
- Sets `__normalized = true` to prevent re-normalization
- Applies light redaction (sensitive keys only)
- Attached to `meta.cause` in `<Port>Error`

**Stage 2: Emission (in logger)**

- Logger checks `error.__normalized`:
  - If `true`: Skip `normalizeError()` (already done)
  - If `false`: Call `normalizeError()` (safety net)
- **Always** apply `applyFullRedaction()` regardless of normalized flag
- Full redaction is a separate deep traversal step

**Rules:**

- `normalizeError()` may run 0 or 1 times per error
- `applyFullRedaction()` ALWAYS runs exactly once before emission
- Light redaction ⊂ Full redaction

```ts
// lib/errors.ts
type NormalizedError = {
  __normalized?: true;
  name?: string;
  message?: string;
  truncatedStack?: string;
  cause?: NormalizedError;
};
```

#### Redaction

**Two separate functions**

- `normalizeError()` → serialization + light redaction
- `applyFullRedaction()` → deep redaction only
- Both can run on the same error (full is superset of light)

```
// src/lib/errors.ts
export function applyFullRedaction(obj: unknown): unknown;
```

```
┌──────────────────────────────────────────────────────────────────────┐
│ Stage │ Function            │ Where    │ What              │ When    │
├──────────────────────────────────────────────────────────────────────┤
│ 1     │ normalizeError()    │ Adapters │ Light (sensitive) │ Capture │
│ 2     │ applyFullRedaction()│ Logger   │ Deep traversal    │ Emit    │
└──────────────────────────────────────────────────────────────────────┘
```

**1. Light Redaction (capture)**

- Applied via `normalizeError()` in adapter catch blocks
- Idempotent (checks `__normalized` flag)
- See [Errors Guideline § Light Redaction](./errors.md#light-redaction)

**2. Full Redaction (emission)**

- Applied via `applyFullRedaction()` in logger before emission
- **Always runs**, regardless of `__normalized` flag
- Deep recursive traversal (handles nested objects, arrays, causes)
- Circular-reference safe (uses WeakSet)
- Configurable via `LOG_REDACT` env var

**Redaction patterns and levels:**

High sensitivity (always redacted):

- password, passwd, pwd
- token, jwt, bearer, access_token, refresh_token
- secret, api_key, apikey, private_key
- authorization, auth_header
- credit_card, card_number, cvv, ccv, cvc
- ssn, social_security

Medium sensitivity (redacted by default):

- email (replaced with domain only: user@example.com → ...@example.com)
- phone, mobile, telephone
- address, street, postal_code, zip_code

Low sensitivity (logged but truncated):

- message (truncated to 200 chars)
- stack, stacktrace (truncated to 1000 chars)

Never redacted (safe for logging):

- id, userId, entityId (stable non-PII business identifiers)
- traceId, requestId, errorId (correlation IDs)
- timestamp, duration, attempt
- code, status, kind, type
- adapter, module, scope, cmd

> Configurable via `LOG_REDACT` env var.

**Special handling:**

- URLs: Query params redacted, path preserved
  - Before: https://api.com/users?token=secret123
  - After: https://api.com/users?token=[REDACTED]
- Objects: Recursive traversal with circular reference detection
- Arrays: Element-wise redaction
- null/undefined: Preserved as-is

### Configuration

#### Environment Variables

- `LOG_LEVEL`: Minimum log level (default: `info` in prod, `debug` in dev)
  - Values: `error`, `warn`, `info`, `debug`
- `LOG_FORMAT`: Output format (default: `json`)
  - Values: `json`, `pretty` (human-readable, dev only)
- `LOG_REDACT`: Enable/disable automatic redaction (default: `true`)
  - Values: `true`, `false` (disable only for local debugging)

### Performance Considerations

- Prefer sync `LoggerPort`; use async only if necessary
- Sample noisy logs: log every Nth attempt (e.g. retries: log attempts 1, 5, 10, final)
- Use conditional logging for hot paths (check level before expensive serialization)

### Architecture flows:

**Flow 1: CLI (without interface layer)**

```
entrypoint (cli.ts)
  → usecase
    → adapter/domain/lib
    → usecase
  → entrypoint (exit code)
```

**Flow 2: HTTP (with interface layer)**

```
entrypoint (http.ts)
  → interface (controller/router)
    → usecase
      → adapter/domain/lib
      → usecase
    → interface (response formatter)
  → entrypoint (start server)
```

**Flow 3: Worker/Job (without interface)**

```
entrypoint (worker.ts)
  → usecase
    → adapter/domain/lib
    → usecase
  → entrypoint (ack/nack)
```
