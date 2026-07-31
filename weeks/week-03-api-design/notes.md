# Week 3: API Design From First Principles

## Goal

Understand how two programs communicate reliably over an unreliable network, and why every API design rule exists as a solution to a specific problem.

By the end of this week, you should be able to explain:

- what an API actually is at the protocol level — not just "routes and handlers"
- why REST exists as an architectural style and what constraints it actually imposes
- why HTTP methods have safety and idempotency guarantees, and what breaks when you violate them
- how status codes function as a machine-readable protocol — not just numbers to memorize
- why TypeScript types vanish at the HTTP boundary and what actually validates input
- how pagination works mechanistically — why offset breaks and how cursors solve it
- why network failures create ambiguity that idempotency keys resolve
- how ETags prevent lost updates through optimistic concurrency control
- how caching works at the HTTP level — Cache-Control, conditional requests, and 304
- how rate limiting algorithms actually work — token bucket, sliding window, fixed window
- why CORS exists, what the preflight mechanism does, and why it confuses everyone
- how webhooks work and why at-least-once delivery forces receivers to deduplicate
- when REST, GraphQL, and gRPC are each the right choice — from tradeoffs, not hype

This week uses one running example throughout: a **Books API** for a library system. Every concept is grounded in concrete design decisions for this API.

---

## Part 1: What An API Actually Is

An API is not a collection of Express routes. An API is a **contract** — a precise agreement about how two programs communicate over a network.

### Why this distinction matters

Your Express route handler is the server-side *implementation* of the contract. But the contract itself is the externally visible agreement: which URLs exist, what methods each accepts, what inputs are required, what responses are returned, and what each status code means.

A mobile app, a frontend, another microservice, or a third-party integration all build against this contract. They parse your responses, check your status codes, and rely on your field names. If you rename a JSON field from `fullName` to `name`, your server still runs fine — but every client that expected `fullName` breaks silently.

This is why API design is fundamentally different from writing internal functions. Internal functions have one caller in the same codebase. API endpoints have unknown callers you don't control, deployed on schedules you don't set.

### The anatomy of an HTTP API exchange

When a client calls your API, here is what actually travels over the network:

**Request:**

```http
GET /books/42 HTTP/1.1
Host: api.bookcase.test
Accept: application/json
Authorization: Bearer eyJhbGciOi...
X-Request-Id: req_abc123
```

Five distinct pieces of information:

1. **Method** (`GET`) — the *intent*. Not a suggestion, not a label — a semantic promise about what this request does.
2. **Path** (`/books/42`) — the *identity* of the resource. This is the thing being acted upon.
3. **Query parameters** (none here, but `?limit=20&sort=title`) — *modifiers* for the operation.
4. **Headers** — *metadata* about the request: who is calling, what format they accept, how to trace the request.
5. **Body** (empty for GET) — the *data payload*, used for creation and modification.

**Response:**

```http
HTTP/1.1 200 OK
Content-Type: application/json
ETag: "v7"
Cache-Control: max-age=60
X-Request-Id: req_abc123

{"id": "42", "title": "Dune", "author": "Frank Herbert", "availableCopies": 3}
```

Four distinct pieces:

1. **Status code** (`200`) — a machine-readable *signal*. Clients, proxies, caches, and monitoring systems all interpret this before reading the body.
2. **Headers** — metadata about the response: content type, caching rules, versioning.
3. **Body** — the *representation* of the resource.
4. **ETag** (`"v7"`) — a version identifier for concurrency control (we'll cover this in depth later).

### The request lifecycle inside your server

When those bytes arrive at your Node.js process, here is the path they take:

```
Network bytes arrive
    ↓
Node's HTTP parser (llhttp) parses method, path, headers
    ↓
Framework (Express/Fastify) creates req and res objects
    ↓
Router matches method + path to a handler chain
    ↓
Middleware runs in order:
  → JSON body parser (reads req body stream, parses JSON)
  → Authentication (validates token, attaches user to req)
  → Request logging (logs method, path, requestId)
    ↓
Route handler runs:
  → Input validation (is this body well-formed and valid?)
  → Business logic (does the domain allow this operation?)
  → Data access (read or write to database)
  → Response construction (build the JSON representation)
    ↓
Response middleware:
  → Error handler (catches thrown errors, formats error response)
  → Response logging (logs status code, duration)
    ↓
res.json() serializes JSON, sets Content-Type header
    ↓
Node writes HTTP response bytes to the TCP socket
    ↓
Bytes travel back to client
```

Why trace this? Because understanding this flow explains why certain design decisions matter:

- Validation *must* happen before business logic — you cannot check domain rules on garbage input.
- Authentication middleware runs before the handler — so a 401 is returned before you waste time on business logic.
- Error handling middleware must catch everything — an unhandled exception crashes the process.
- The body parser must run before your handler can access `req.body`.

Each of these is a real mechanism, not a best practice. The ordering is enforced by how middleware stacks work.

---

## Part 2: Resources, URLs, and REST

### What is a resource?

A resource is a **meaningful thing** your API exposes — something that has an identity and can be referenced. In our Books API:

- A book (`/books/42`)
- A member (`/members/m_7`)
- A borrow record (`/borrows/borrow_91`)
- The collection of all books (`/books`)

A resource is not a database table. A resource is a domain concept that clients interact with. Sometimes a resource maps to one table. Sometimes it aggregates data from multiple tables. Sometimes it represents a computed view.

### What is a representation?

A representation is the **data you send** to describe a resource at a point in time. When you call `GET /books/42`, you don't get "the book." You get a JSON representation of the book's current state.

This distinction matters because:

1. The same resource can have different representations. A list view might return `{id, title, author}`. A detail view might return `{id, title, author, isbn, publishedYear, availableCopies, borrowHistory}`.
2. The representation changes over time. The book's `availableCopies` changes when someone borrows it. The resource identity (`/books/42`) stays the same.

### URL design from first principles

URLs serve two purposes: **identification** (which resource) and **navigation** (how to find related resources).

For the Books API:

```
/books              → the collection of all books
/books/42           → book with ID 42
/books/42/borrows   → borrow records for book 42
/members/m_7        → member with ID m_7
```

Why plural nouns? Because `/books` is a collection and `/books/42` is a member of that collection. Using `/book/42` creates an inconsistency — is `/book` one book or the collection? Plural avoids this ambiguity.

Why path parameters for identity? Because `GET /books/42` says "the book whose identity is 42." The 42 is not a filter — it is the identifier. Compare with `GET /books?id=42`, which says "search the books collection for one matching id=42" — a semantically different operation.

### Where different inputs belong

This is not arbitrary convention. Each location has a purpose dictated by HTTP mechanics:

**Path parameters** — identify the resource. They are part of the URL, which means they appear in logs, caches, bookmarks, and browser history. They identify *what* you're operating on.

```
GET /books/42         → I want book 42
DELETE /books/42      → Delete book 42
```

**Query parameters** — modify a read operation. They adjust *how* you retrieve data: filtering, sorting, pagination, format selection. They are also part of the URL, so they become part of the cache key.

```
GET /books?author=Frank+Herbert&limit=20&sort=title
```

Why not put filters in the body? Because GET requests conventionally have no body. HTTP technically allows it, but many proxies, caches, and clients strip or ignore GET bodies. Building around a GET body creates fragile systems.

**Headers** — carry request metadata. Authentication tokens, content type preferences, request tracing IDs, caching directives. These are not about the resource — they are about the request itself.

```
Authorization: Bearer eyJhbGciOi...
Accept: application/json
X-Request-Id: req_abc123
If-Match: "v7"
```

**Request body** — carry data for creation or modification. Used with POST, PUT, and PATCH.

```json
POST /books
{"title": "Dune", "author": "Frank Herbert", "isbn": "978-0-441-17271-9"}
```

### What REST actually means

REST (Representational State Transfer) is an architectural style, not a specification. Roy Fielding defined it in his 2000 dissertation. The constraints that matter for API design are:

1. **Client-server separation** — the client and server evolve independently. The server doesn't know the client's UI; the client doesn't know the server's database.
2. **Statelessness** — each request contains all information needed to process it. The server does not store session state between requests. (This is why tokens travel in every request header.)
3. **Uniform interface** — resources are identified by URLs, manipulated through representations, and self-descriptive messages (status codes, content types).
4. **Cacheability** — responses declare whether they can be cached and for how long.

REST does **not** mean:
- Every endpoint must be CRUD (Create, Read, Update, Delete)
- You must use all HTTP methods
- URLs must be perfectly "RESTful" (there is no such specification)
- You need HATEOAS (hypermedia links in every response) — Level 3 of the Richardson Maturity Model is rarely implemented in practice

Most well-designed JSON APIs are "Level 2 REST" — resource URLs + correct methods + correct status codes. That is professional and sufficient.

### When actions don't fit CRUD

Sometimes a domain action is better modeled as creating a sub-resource than as updating a field.

**Borrowing a book** — you could model this as `PATCH /books/42 {"availableCopies": 2}`, but that misses the domain meaning. Borrowing checks member eligibility, creates a borrow record with a due date, and decrements availability atomically.

Better:

```
POST /books/42/borrows
{"memberId": "m_7"}
```

Response:

```json
{
  "id": "borrow_91",
  "bookId": "42",
  "memberId": "m_7",
  "borrowedAt": "2026-07-27T10:00:00.000Z",
  "dueAt": "2026-08-10T10:00:00.000Z"
}
```

This makes the domain action visible in the URL, creates a resource you can later query (`GET /books/42/borrows`), and keeps the borrow logic separate from generic book updates.

The rule: if an action has important domain meaning beyond editing a field, model the result as a resource.

---

## Part 3: HTTP Methods — What They Promise

HTTP methods are not labels. They are **semantic promises** that the entire HTTP infrastructure relies on.

### Safety

A safe method promises that it **does not intentionally change server state**. GET, HEAD, and OPTIONS are safe.

Why this matters mechanistically:

- **Browsers prefetch** links marked as safe. If Google's crawler follows a `GET /books/42/delete` link, it deletes the book. This has happened in real production systems.
- **Proxies cache** safe requests. A proxy can serve a cached GET response without forwarding to your server. If your GET modifies state, the modification only happens on the first request.
- **Monitoring systems** send GET requests to check health. A GET that creates records fills your database with monitoring artifacts.
- **Browser history** stores GET URLs. Going "back" replays the GET. If it charges money, you've charged the user again.

Safe does not mean "has no side effects." A GET that increments a view counter is acceptable — the side effect is incidental, not the intended purpose. But a GET that creates an order is a contract violation.

### Idempotency

An idempotent method promises that **performing the same request multiple times has the same intended effect as performing it once**.

Idempotent methods: GET, PUT, DELETE, HEAD, OPTIONS.
Not inherently idempotent: POST, PATCH (depends on the operation).

Why idempotency exists — the network problem:

```
Client sends PUT /books/42 {"title": "Dune"}
    ↓
Server receives it, updates the book, sends 200 OK
    ↓
200 OK is lost in the network — client never receives it
    ↓
Client doesn't know: did the update happen or not?
    ↓
Client retries the same PUT /books/42 {"title": "Dune"}
    ↓
Server receives it again — and because PUT is idempotent,
the book is still "Dune" after the second request.
No damage done.
```

Now imagine the same scenario with POST:

```
Client sends POST /orders {"bookId": "42", "memberId": "m_7"}
    ↓
Server creates order_001, sends 201 Created
    ↓
201 is lost — client never receives it
    ↓
Client retries the same POST
    ↓
Server creates order_002 — a DUPLICATE order
```

This is the fundamental problem that idempotency solves. The network does not guarantee delivery of responses. If the client cannot tell whether the first request succeeded, it must be safe to retry.

### Idempotency does not require identical responses

This is a common misconception. Consider:

```
DELETE /books/42  →  204 No Content (book deleted)
DELETE /books/42  →  404 Not Found (book already gone)
```

The *responses* differ, but the *server state* is the same: book 42 does not exist. That's idempotent. The promise is about the final state, not the response.

### PUT vs PATCH — a real difference

**PUT** means **replace the entire resource** with the provided representation.

```
PUT /books/42
{"title": "Dune", "author": "Frank Herbert", "availableCopies": 3}
```

This tells the server: "The complete state of book 42 should be exactly this." If you omit `availableCopies`, a strict PUT implementation would set it to undefined/null — because you sent the complete representation and it didn't include that field.

PUT is naturally idempotent: sending the same complete representation twice leaves the same state.

**PATCH** means **apply a partial modification**.

```
PATCH /books/42
{"title": "Dune: Revised Edition"}
```

This tells the server: "Change only the title. Leave everything else unchanged."

PATCH can be idempotent or not, depending on the operation:

- `{"availableCopies": 3}` — set to 3. Idempotent. Repeating it leaves the value at 3.
- `{"incrementCopies": 1}` — add one. NOT idempotent. Repeating it adds another copy each time.

When designing PATCH operations, prefer absolute values over relative ones if you want idempotency. If you need relative operations, use idempotency keys (covered later).

### POST — the catch-all

POST means "submit data to be processed." It makes no idempotency promise. Each POST can create a new resource, trigger a side effect, or process a command.

This is why POST is used for:
- Creating new resources (`POST /books`)
- Triggering actions (`POST /books/42/borrows`)
- Any operation that doesn't fit GET, PUT, PATCH, or DELETE

---

## Part 4: Status Codes — A Machine-Readable Protocol

Status codes are not decorative. They are a **machine-readable protocol** that the entire HTTP infrastructure — clients, proxies, caches, load balancers, monitoring systems, and retry logic — uses to make decisions before reading your response body.

### Why status codes matter mechanistically

When your API returns a status code, here is what happens at each layer:

- **HTTP client libraries** (axios, fetch, got) decide whether to throw an error or return data based on the status code.
- **Proxies and CDNs** cache 200 responses but never cache 500 responses. A 301 triggers permanent redirect following. A 304 means "use your cache."
- **Load balancers** count 5xx responses. Too many triggers circuit breakers or removes your server from the pool.
- **Monitoring systems** (Datadog, Prometheus) alert on 5xx rates. A spike in 500s pages your on-call engineer at 3 AM.
- **Retry logic** retries on 503 (Service Unavailable) and 429 (Too Many Requests) but not on 400 (Bad Request, because retrying a bad request won't fix it).

If you return `200 OK` with `{"success": false, "error": "not found"}` in the body, every one of these systems thinks the request succeeded. Your monitoring shows 0% errors while users see failures. Caches store the error response and serve it to other users. Retry logic doesn't trigger.

This is not a style preference. It is a protocol violation with real consequences.

### The status codes you need to understand

**2xx — Success**

| Code | When to use | Example |
|------|-------------|---------|
| `200 OK` | Request succeeded, response has a body | `GET /books/42` returns the book |
| `201 Created` | A new resource was created | `POST /books` creates a new book |
| `202 Accepted` | Request was accepted but processing is not complete | `POST /exports` starts a long-running export job |
| `204 No Content` | Request succeeded, no body to return | `DELETE /books/42` after successful deletion |

**201 vs 200 on creation**: When you `POST /books` and a book is created, return `201 Created` with the new resource in the body and a `Location: /books/43` header pointing to the new resource's URL. This tells the client both "it was created" and "here's where to find it."

**202 — the async pattern**: When an operation takes too long for a synchronous response (e.g., generating a report), return 202 immediately with a job ID. The client polls a status endpoint until the job completes:

```
POST /exports  →  202 Accepted
                  {"jobId": "job_1", "statusUrl": "/exports/job_1"}

GET /exports/job_1  →  200 OK
                       {"status": "processing", "progress": 45}

GET /exports/job_1  →  200 OK
                       {"status": "completed", "downloadUrl": "/exports/job_1/file"}
```

**3xx — Redirection**

| Code | Meaning |
|------|---------|
| `301 Moved Permanently` | Resource has a new permanent URL. Clients and caches should update. |
| `304 Not Modified` | The client's cached version is still valid. Don't send the body. |

**4xx — Client error (the client did something wrong)**

| Code | When to use | The problem |
|------|-------------|-------------|
| `400 Bad Request` | The request is malformed | Invalid JSON, wrong Content-Type, missing required structure |
| `401 Unauthorized` | Authentication is missing or invalid | No token, expired token, invalid token |
| `403 Forbidden` | Authenticated but not authorized | Valid token, but this user cannot access this resource |
| `404 Not Found` | Resource does not exist | `/books/9999` and there is no book 9999 |
| `405 Method Not Allowed` | The HTTP method is not supported for this URL | `DELETE /books` (you can delete a book, not the collection) |
| `409 Conflict` | The request conflicts with current server state | Trying to borrow a book with 0 available copies |
| `412 Precondition Failed` | An explicit precondition header failed | `If-Match` ETag doesn't match current version |
| `415 Unsupported Media Type` | The request body format is not supported | Sending XML when only JSON is accepted |
| `422 Unprocessable Content` | The request is syntactically valid but semantically wrong | Title is an empty string, quantity is negative |
| `429 Too Many Requests` | Rate limit exceeded | Client sent too many requests in the time window |

### The 400 vs 422 boundary

This is the most debated status code distinction. Here is a clear rule:

**400**: The server cannot even parse or structurally understand what you sent. The problem is at the transport/syntax level.
- Request body is not valid JSON: `{title: "Dune"}` (missing quotes on key)
- Content-Type header says `application/json` but body is XML
- A required field is completely missing from the JSON structure
- A field is the wrong primitive type: `{"availableCopies": "three"}` when a number is expected

**422**: The server parsed and understood the request perfectly, but the values are invalid.
- Title is an empty string: `{"title": ""}`
- Available copies is negative: `{"availableCopies": -1}`
- ISBN format is wrong: `{"isbn": "not-an-isbn"}`
- Date is in the past when it should be in the future

The distinction: 400 means "I can't understand you," 422 means "I understand you, but I can't accept this."

Some teams use 400 for everything. That is workable if documented and consistent. But the distinction gives clients better information: a 400 usually means a bug in request construction, while a 422 means the user needs to fix their input.

### 401 vs 403 — authentication vs authorization

These are frequently confused, partly because 401 is misleadingly named "Unauthorized."

**401 Unauthorized** means **authentication failed**. The server does not know who you are.
- No `Authorization` header sent
- Token is expired
- Token is malformed or invalid

The server is saying: "I need to know who you are before I can decide anything. Prove your identity."

**403 Forbidden** means **authorization failed**. The server knows exactly who you are, but you don't have permission.
- User is authenticated but is not an admin
- User is trying to access another user's data
- User's account is suspended

The server is saying: "I know who you are. The answer is no."

Why this distinction matters: A 401 tells the client to re-authenticate (re-login, refresh the token). A 403 tells the client that re-authenticating won't help — the user genuinely doesn't have access.

### 5xx — Server error (your code is broken)

| Code | When to use |
|------|-------------|
| `500 Internal Server Error` | Unhandled exception, unexpected bug |
| `502 Bad Gateway` | Your server got a bad response from an upstream service |
| `503 Service Unavailable` | Server is temporarily unable to handle requests (overloaded, maintenance) |
| `504 Gateway Timeout` | Upstream service timed out |

The critical rule: **4xx errors are the client's fault. 5xx errors are your fault.** If your code throws because a database query failed, that's a 500 — the client did nothing wrong. If your code throws because the client sent an empty string where a title was expected, that should be caught by validation and returned as 422, not allowed to bubble up as 500.

Every 500 error is a bug report. If your API returns 500s in normal operation, something is wrong with your error handling.

---

## Part 5: Validation — Why TypeScript Cannot Protect Your HTTP Boundary

This is one of the most practically important and least understood concepts in backend engineering.

### The boundary problem

TypeScript gives you type safety *within your codebase*. When you write:

```typescript
interface CreateBookInput {
  title: string;
  author: string;
  isbn?: string;
}
```

This guarantees that everywhere in your code that uses `CreateBookInput`, the `title` will be a string. But TypeScript compiles to JavaScript. At runtime, the types are gone. And at the HTTP boundary — where raw bytes from the network become `req.body` — there are no types at all.

A client can send:

```json
{"title": 42}
```

```json
{"title": null}
```

```json
{"title": ""}
```

```json
{"title": "   "}
```

```json
{}
```

```json
{"title": "Dune", "author": "Herbert", "isAdmin": true}
```

Or even:

```
not json at all
```

Your Express body parser will parse whatever valid JSON it receives and put it in `req.body`. If you cast it as `CreateBookInput`, TypeScript will not complain — but the data might be garbage.

### What actually validates

Runtime validation. Code that executes at request time and checks every assumption about the incoming data:

```typescript
function validateCreateBook(body: unknown): CreateBookInput {
  if (typeof body !== 'object' || body === null) {
    throw new ValidationError('Request body must be a JSON object');
  }

  const obj = body as Record<string, unknown>;

  if (typeof obj.title !== 'string') {
    throw new ValidationError('title must be a string');
  }

  if (obj.title.trim().length === 0) {
    throw new ValidationError('title must not be empty');
  }

  if (obj.title.length > 500) {
    throw new ValidationError('title must be at most 500 characters');
  }

  if (typeof obj.author !== 'string') {
    throw new ValidationError('author must be a string');
  }

  if (obj.author.trim().length === 0) {
    throw new ValidationError('author must not be empty');
  }

  // isbn is optional — but if present, must be valid
  if (obj.isbn !== undefined) {
    if (typeof obj.isbn !== 'string') {
      throw new ValidationError('isbn must be a string');
    }
    if (!isValidIsbn(obj.isbn)) {
      throw new ValidationError('isbn format is invalid');
    }
  }

  return {
    title: obj.title.trim(),
    author: obj.author.trim(),
    isbn: obj.isbn,
  };
}
```

Libraries like **zod**, **joi**, or **yup** make this less verbose, but the principle is the same: treat `req.body` as `unknown` until validated.

### Edge cases that catch everyone

These are the inputs that pass naive validation but cause bugs:

| Input | Problem |
|-------|---------|
| `""` (empty string) | Passes `typeof x === 'string'` but creates a book with no title |
| `"   "` (whitespace only) | Same problem. Always `.trim()` before checking emptiness |
| `0` | Falsy in JavaScript. `if (!limit)` treats 0 the same as undefined |
| `null` | `typeof null === 'object'` in JavaScript. `if (typeof body === 'object')` passes for null |
| `false` | Falsy. `if (!value)` treats false the same as undefined |
| `"42"` instead of `42` | A number sent as a string. Query params are always strings. Body values depend on how the client built the JSON |
| Extra fields | `{"title": "Dune", "isAdmin": true}` — if you spread this into your database model, you've just given the attacker admin access |

The `null` gotcha is especially insidious in JavaScript:

```javascript
typeof null === 'object'  // true! A famous JavaScript bug from 1995
```

So `typeof body === 'object'` is not sufficient — you must also check `body !== null`.

### Validation is not business logic

Validation checks the *shape* of the request. Business logic checks the *state* of the system.

- **Validation**: "title is a non-empty string" — this can be checked by looking at the request alone.
- **Business logic**: "this member cannot borrow more than 5 books" — this requires querying the database.

Both return 4xx errors, but they are different layers:

```
Validation fails → 400 or 422 (the request itself is wrong)
Business rule fails → 409 or 422 (the request is valid but the system state doesn't allow it)
```

Keep them separate. Validation should be stateless and fast. Business rules involve the database and may need transactions.

---

## Part 6: Error Design — When Things Go Wrong

### Why error format matters

Clients need to programmatically handle errors. If your success responses are structured JSON but your error responses are sometimes strings, sometimes objects with different shapes, and sometimes HTML from your reverse proxy, every client needs custom error-parsing code for every endpoint.

### The problem with ad-hoc errors

```json
{"error": "Not found"}
```

```json
{"message": "Validation failed", "errors": ["title is required"]}
```

```json
{"success": false, "reason": "Book unavailable"}
```

Three different shapes. A client cannot write one error-handling function. And worse — the client cannot distinguish between "your input was wrong" and "the server is broken" without parsing free-text messages.

### RFC 9457 Problem Details — a standard error format

RFC 9457 (formerly RFC 7807) defines a standard structure for HTTP API errors:

```json
{
  "type": "https://api.bookcase.test/errors/validation-error",
  "title": "Validation failed",
  "status": 422,
  "detail": "The 'title' field must not be empty",
  "instance": "/books",
  "requestId": "req_abc123",
  "errors": [
    {"field": "title", "message": "Must not be empty", "code": "required"}
  ]
}
```

Each field has a purpose:

- **`type`** — a stable URI that identifies the error *category*. Clients use this to decide what action to take. This is the machine-readable part.
- **`title`** — a short human-readable summary of the error type. Does not change between occurrences of the same type.
- **`status`** — the HTTP status code, repeated in the body for convenience.
- **`detail`** — a human-readable explanation of this specific occurrence. Can change between occurrences. Clients must NOT parse this programmatically.
- **`instance`** — identifies the specific request that caused the error (often the URL path).
- **`requestId`** — correlates the client's error report with your server logs.
- **`errors`** — (extension field) field-level validation details for form-like UIs.

### Why clients should branch on `type`, not `detail`

`detail` is a human-readable string. You might change it from "title must not be empty" to "title is required" in a future release. If a client parses that string to decide what to do, it breaks.

`type` is a stable identifier. `validation-error` stays `validation-error` across releases. Clients can safely switch on it:

```javascript
if (error.type.endsWith('validation-error')) {
  showFieldErrors(error.errors);
} else if (error.type.endsWith('resource-not-found')) {
  showNotFoundPage();
} else if (error.type.endsWith('rate-limit-exceeded')) {
  waitAndRetry(error.retryAfter);
}
```

### What to never expose in error responses

- Stack traces — tells attackers your code structure and dependencies
- SQL queries — reveals your schema and potentially enables SQL injection
- Internal service URLs — reveals your architecture
- File paths — reveals your deployment structure
- Raw database errors — may contain sensitive data from other queries
- Tokens, passwords, API keys — should never appear in any response

In production, catch all errors, log the full detail (including stack traces) server-side, and return only the sanitized error body to the client:

```typescript
app.use((err, req, res, next) => {
  // Log everything for debugging
  logger.error({
    requestId: req.id,
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
  });

  // Return only what the client needs
  res.status(err.statusCode || 500).json({
    type: err.type || 'internal-error',
    title: err.title || 'Internal server error',
    status: err.statusCode || 500,
    detail: err.statusCode ? err.message : 'An unexpected error occurred',
    requestId: req.id,
  });
});
```

Note how the `detail` field changes based on whether it's a client error (expose the message) or a server error (generic message — the real error is in the logs).

---

## Part 7: Pagination — Why Unbounded Lists Break Systems

### The problem

`GET /books` with 500,000 books in the database. Without pagination:

1. **Database**: Full table scan, 500K rows loaded into memory, serialized into a result set.
2. **Server**: Node.js receives 500K records, serializes them into a JSON string (possibly hundreds of megabytes), stores the entire string in memory.
3. **Network**: Hundreds of megabytes transmitted over the wire. On mobile, this might take minutes or fail.
4. **Client**: Browser tries to parse hundreds of megabytes of JSON. Tab crashes.

Every layer fails. This is why list endpoints must always be bounded.

### Offset pagination — how it works and why it breaks

```
GET /books?offset=0&limit=20    → rows 1-20
GET /books?offset=20&limit=20   → rows 21-40
GET /books?offset=40&limit=20   → rows 41-60
```

Under the hood, the database executes:

```sql
SELECT * FROM books ORDER BY created_at DESC LIMIT 20 OFFSET 40;
```

**How offset works in the database**: The database still reads from the beginning of the index, walks past the first 40 rows (the offset), then returns the next 20. For offset=0, this is fast. For offset=100,000, the database walks past 100,000 rows before returning your 20. The work is O(offset + limit), not O(limit).

**The instability problem**: Offset pagination assumes the list doesn't change between pages. But it does.

Imagine you're viewing page 2 (offset=20). While you're reading, a new book is added to the database. This new book appears at the top of the list (newest first). Now:

```
Before insertion:
Page 1: books 1-20
Page 2: books 21-40  ← you're here
Page 3: books 41-60

After insertion of new book at position 1:
Page 1: new book, books 1-19
Page 2: books 20-39
Page 3: books 40-59
```

When you request page 3 (offset=40), you'll receive books 40-59. But you've already seen book 40 on the old page 2 before the insertion, so you see a duplicate. Similarly, if a row were deleted instead of inserted, items could shift in the opposite direction, causing you to skip a book entirely.

**When offset is fine**: small datasets, page-number UIs where the user explicitly navigates to "page 5," internal admin panels where consistency isn't critical.

### Cursor pagination — the mechanism

Cursor pagination doesn't use positional offsets. Instead, it says: "give me 20 items that come after this specific point in the ordering."

```
GET /books?limit=20
→ returns 20 books, last one has id="book_42", createdAt="2026-07-20T10:00:00Z"
→ response includes: "nextCursor": "eyJjcmVhdGVkQXQiOiIyMDI2LTA3LTIwVDEwOjAwOjAwWiIsImlkIjoiYm9va180MiJ9"

GET /books?limit=20&cursor=eyJjcmVhdGVkQXQiOiIyMDI2LTA3LTIwVDEwOjAwOjAwWiIsImlkIjoiYm9va180MiJ9
→ returns 20 books created before 2026-07-20T10:00:00Z (or same time but with id before book_42)
```

Under the hood, the cursor is a base64-encoded JSON object containing the position marker:

```json
{"createdAt": "2026-07-20T10:00:00Z", "id": "book_42"}
```

The database query becomes:

```sql
SELECT * FROM books
WHERE (created_at, id) < ('2026-07-20T10:00:00Z', 'book_42')
ORDER BY created_at DESC, id DESC
LIMIT 20;
```

**Why this is stable**: The query doesn't depend on a position number. It depends on a specific point in the ordered set. Even if new books are inserted, the query still returns the 20 books that come after book_42 in the ordering. No duplicates, no skips.

**Why this is fast**: The database uses an index on `(created_at, id)` and seeks directly to the cursor position. No walking past rows. O(limit), not O(offset + limit).

### Why cursors need a unique tie-breaker

What if two books have the same `created_at` timestamp? If you use only `created_at` for ordering:

```sql
SELECT * FROM books WHERE created_at < '2026-07-20T10:00:00Z'
ORDER BY created_at DESC LIMIT 20;
```

Two books created at exactly `2026-07-20T10:00:00Z` — one might appear on this page and the other on the next page, or both might be skipped, depending on the database's internal ordering. The result is non-deterministic.

Adding `id` as a tie-breaker makes the ordering deterministic:

```sql
ORDER BY created_at DESC, id DESC
```

Now every book has a unique position in the ordering, regardless of timestamp collisions.

### Cursor response format

```json
{
  "items": [
    {"id": "book_45", "title": "Neuromancer", "createdAt": "2026-07-22T..."},
    {"id": "book_44", "title": "Foundation", "createdAt": "2026-07-21T..."},
    {"id": "book_42", "title": "Dune", "createdAt": "2026-07-20T..."}
  ],
  "page": {
    "limit": 20,
    "nextCursor": "eyJjcmVhdGVkQXQiOi...",
    "hasMore": true
  }
}
```

Why an object instead of a bare array? Because you cannot add pagination metadata to an array without a breaking change. Starting with `{"items": [...], "page": {...}}` lets you add metadata later without changing the top-level type.

Why is the cursor opaque? Because it's an implementation detail. The client should store it and send it back, not construct or decode it. This lets you change the cursor format (e.g., add a new sort field) without breaking clients.

---

## Part 8: Idempotency — Why Networks Make Everything Harder

### The fundamental problem

We covered this briefly in Part 3. Let's go deep on the mechanism.

A client sends `POST /payments`:

```
Client → sends POST /payments {"amount": 5000, "bookId": "42"} → Server
Client ← receives 201 Created {"id": "pay_1", "amount": 5000}  ← Server
```

That's the happy path. Now consider three failure modes:

**Failure 1 — Request never arrives:**
```
Client → sends POST → [network drops packet] → Server never sees it
Client ← timeout (no response)
```
Client can safely retry. No payment was created.

**Failure 2 — Server crashes mid-processing:**
```
Client → sends POST → Server starts processing → [server crashes]
Client ← timeout (no response)
```
Did the payment get created before the crash? Maybe. Client doesn't know.

**Failure 3 — Response is lost:**
```
Client → sends POST → Server creates pay_1, sends 201 → [response lost]
Client ← timeout (no response)
```
Payment was created. But the client doesn't know that. If it retries, a second payment (pay_2) is created. User is charged twice.

The core insight: **a timeout tells the client nothing about server state.** The request might not have arrived, might be processing, or might have completed successfully. The client cannot distinguish these cases.

### How idempotency keys solve this

The client generates a unique key before sending the request:

```
POST /payments
Idempotency-Key: idem_a1b2c3d4
Content-Type: application/json

{"amount": 5000, "bookId": "42"}
```

The server's logic:

```
1. Extract the authenticated user ID and idempotency key
2. Look up: does a record exist for (user_id, idempotency_key)?

   IF YES:
     a. Compare the stored request fingerprint with the current request body
     b. If fingerprint matches → return the stored response (don't create a new payment)
     c. If fingerprint differs → return 409 Conflict (same key, different request = client bug)

   IF NO:
     a. Create a record with status "processing" for (user_id, idempotency_key)
     b. Perform the payment
     c. Store the response in the record, update status to "completed"
     d. Return the response
```

Now when the client retries after a timeout:

```
Retry: POST /payments, Idempotency-Key: idem_a1b2c3d4
Server: "I already processed idem_a1b2c3d4 for this user → return stored response"
Client: receives 201 Created with pay_1 (the original payment, not a duplicate)
```

### The race condition

What if two retries arrive simultaneously?

```
Retry 1: POST /payments, Key: idem_a1b2c3d4  → arrives at server
Retry 2: POST /payments, Key: idem_a1b2c3d4  → arrives at server 5ms later
```

Both look up the key. Neither finds an existing record. Both try to create the payment.

Solution: the "create a record with status processing" step must be **atomic**. In PostgreSQL:

```sql
INSERT INTO idempotency_keys (user_id, key, status, request_fingerprint)
VALUES ('user_1', 'idem_a1b2c3d4', 'processing', 'hash_of_body')
ON CONFLICT (user_id, key) DO NOTHING
RETURNING *;
```

If the insert succeeds (returns a row), this request "wins" and processes the payment. If it fails (conflict, returns no row), another request already claimed this key — wait for it to complete, then return the stored response.

### What the request fingerprint prevents

Why compare the body hash? Imagine this client bug:

```
POST /payments, Key: idem_abc, Body: {"amount": 5000}   → creates pay_1
POST /payments, Key: idem_abc, Body: {"amount": 10000}  → same key, different amount!
```

Without fingerprint comparison, the second request would return the stored response for 5000 — even though the client asked for 10000. The client would think a 10000 payment was created when actually a 5000 payment exists.

With fingerprint comparison, the second request returns 409 Conflict: "You used this key before with different data."

### Where idempotency keys are critical

- Payment processing
- Order creation
- Booking/reservation systems
- Any operation where duplication costs money, creates legal liability, or confuses users

---

## Part 9: Concurrent Updates — The Lost Update Problem

### The problem

Two clients read the same book:

```
Client A: GET /books/42 → {"title": "Dune", "author": "Herbert", "availableCopies": 3}
Client B: GET /books/42 → {"title": "Dune", "author": "Herbert", "availableCopies": 3}
```

Client A changes the title:
```
Client A: PATCH /books/42 {"title": "Dune: Special Edition"}
Server: updates title → book is now {"title": "Dune: Special Edition", "author": "Herbert", "availableCopies": 3}
```

Client B, still looking at the old data, changes available copies:
```
Client B: PATCH /books/42 {"availableCopies": 5}
Server: updates copies → book is now {"title": "Dune: Special Edition", "author": "Herbert", "availableCopies": 5}
```

In this case, PATCH is fine because each client changed a different field. But what if both clients edit the title?

```
Client A: PATCH /books/42 {"title": "Dune: Special Edition"}
Client B: PATCH /books/42 {"title": "Dune: Collector's Edition"}
```

Client A's change is silently overwritten. Client A has no idea. This is a **lost update**.

### ETags — optimistic concurrency control

The solution is versioning. The server tracks a version identifier for each resource.

**Step 1: Read with ETag**

```
GET /books/42

HTTP/1.1 200 OK
ETag: "v7"

{"id": "42", "title": "Dune", "availableCopies": 3}
```

The `ETag` is a version identifier. It can be a version counter, a content hash, or a database row version (like PostgreSQL's `xmin` system column).

**Step 2: Update with If-Match**

```
PATCH /books/42
If-Match: "v7"

{"title": "Dune: Special Edition"}
```

The `If-Match` header says: "Only apply this update if the current version is still v7."

**Step 3: Server checks**

```
Current version in database: "v7"
If-Match header: "v7"
Match! → Apply the update, increment version to "v8"

HTTP/1.1 200 OK
ETag: "v8"
{"id": "42", "title": "Dune: Special Edition", "availableCopies": 3}
```

**Step 4: Second client's update fails**

```
PATCH /books/42
If-Match: "v7"         ← still using old version
{"title": "Dune: Collector's Edition"}

Server checks:
Current version: "v8"  ← changed by Client A
If-Match: "v7"         ← doesn't match!

HTTP/1.1 412 Precondition Failed
{"type": "precondition-failed", "detail": "Resource was modified. Fetch the latest version and retry."}
```

Client B now knows: "Someone else changed this. I need to re-read, show the user the conflict, and let them decide."

### Why this is called "optimistic"

It's called **optimistic concurrency control** because it assumes conflicts are rare. Both clients read and work freely without locking anything. The check only happens at write time. If conflicts are rare (which they usually are in web applications), this approach has no overhead — you just return an extra header.

Compare with **pessimistic concurrency control** (database locks): Client A acquires a lock, preventing Client B from reading until A is done. This works but degrades performance under high concurrency and risks deadlocks.

For web APIs, optimistic concurrency (ETags) is almost always the right choice.

### ETag for caching (different use case)

ETags serve double duty. For concurrency control, the flow is: `If-Match` on write → `412` if stale. For caching, the flow is different:

```
Client: GET /books/42
Server: 200 OK, ETag: "v7", Cache-Control: max-age=60

[60 seconds pass, cache expires]

Client: GET /books/42
If-None-Match: "v7"

Server checks: current version is still "v7"
Server: 304 Not Modified (no body)

Client uses its cached copy.
```

`If-None-Match` on read → `304` if still current. This saves bandwidth: the server confirms the data hasn't changed without retransmitting it.

---

## Part 10: Caching — Avoiding Redundant Work

### Why caching matters for APIs

Every request to your API has costs:

1. Network round-trip time
2. TLS overhead
3. Server CPU for processing
4. Database queries
5. Bandwidth for the response

If the same data is requested repeatedly and hasn't changed, all of this work is wasted. HTTP has built-in caching mechanisms to avoid it.

### Cache-Control — the directive

The `Cache-Control` response header tells clients and intermediaries how to cache the response:

```
Cache-Control: max-age=60, public
```

- `max-age=60` — this response can be reused for 60 seconds without revalidation.
- `public` — any cache (browser, CDN, proxy) can store this.
- `private` — only the client's browser can cache this (not shared caches like CDNs). Use for user-specific data.
- `no-cache` — the response can be stored, but must be revalidated with the server before each use.
- `no-store` — the response must not be stored anywhere. Use for sensitive data (financial records, personal medical data).

### Conditional requests — the 304 flow

After `max-age` expires, the client doesn't need to re-download the entire response if it hasn't changed. This is where ETags and `If-None-Match` come in (covered in Part 9's caching section).

The full flow:

```
1. Client: GET /books/42
   Server: 200 OK, ETag: "v7", Cache-Control: max-age=60
   [Client caches the response]

2. [Within 60 seconds]
   Client: GET /books/42
   [Client serves from cache — no network request at all]

3. [After 60 seconds]
   Client: GET /books/42, If-None-Match: "v7"
   Server: "v7 is still current" → 304 Not Modified (no body)
   [Client reuses cached response, resets 60-second timer]

4. [After another 60 seconds, book was updated]
   Client: GET /books/42, If-None-Match: "v7"
   Server: "version is now v8" → 200 OK, ETag: "v8", full body
   [Client replaces cached response]
```

### Caching pitfalls

**Never cache user-specific data in shared caches.** If `GET /profile` returns user A's profile and a CDN caches it with `Cache-Control: public`, user B gets user A's profile. Use `private` for user-specific data.

**Be careful with authenticated endpoints.** Most authenticated API responses should use `Cache-Control: private` or `no-store`. A proxy caching an authenticated response could serve it to unauthorized clients.

**Cache keys include the full URL.** `GET /books?limit=20` and `GET /books?limit=50` are different cache entries. This means query parameters affect caching behavior.

---

## Part 11: Rate Limiting — Protecting Your System

### Why rate limiting exists

Without rate limiting, one client can consume your entire server capacity:

- A buggy script sending 10,000 requests per second
- A DDoS attack flooding your API
- A legitimate client with an inefficient retry loop

Rate limiting ensures fair resource distribution and prevents cascading failures.

### Fixed window

The simplest algorithm. Divide time into fixed windows (e.g., 1-minute intervals). Count requests per window. If the count exceeds the limit, reject.

```
Window: 14:00:00 - 14:00:59
  Request 1 → count=1 → allow
  Request 2 → count=2 → allow
  ...
  Request 100 → count=100 → allow (limit is 100)
  Request 101 → count=101 → REJECT 429

Window: 14:01:00 - 14:01:59
  Counter resets to 0.
  Request 1 → count=1 → allow
```

**The boundary burst problem**: A client can send 100 requests at 14:00:59 and another 100 at 14:01:00 — 200 requests in 2 seconds, even though the limit is 100 per minute. The window boundary allows double the intended rate.

### Sliding window log

Keep a timestamped log of every request. To check the limit, count requests in the last N seconds.

```
Request at 14:00:45 → log: [14:00:45]
Request at 14:00:46 → log: [14:00:45, 14:00:46]
...
Request at 14:01:30 → count requests after 14:00:30 = check last 60s

Expired entries (before 14:00:30) are removed.
```

Accurate but memory-expensive: storing a timestamp per request for every client.

### Sliding window counter

A practical approximation. Combine the current window count and the previous window count, weighted by how far into the current window we are.

```
Previous window (14:00-14:01): 80 requests
Current window (14:01-14:02): 30 requests so far
Current position: 14:01:15 (25% into the current window)

Weighted count = (previous × remaining%) + current
              = (80 × 0.75) + 30
              = 60 + 30
              = 90

Limit is 100 → allow (90 < 100)
```

Less memory than the log approach, smoother than fixed window, and no boundary burst problem.

### Token bucket

Imagine a bucket that fills with tokens at a steady rate. Each request costs one token. If the bucket is empty, the request is rejected.

```
Bucket capacity: 10 tokens (maximum burst)
Refill rate: 2 tokens per second (sustained rate)

Time 0:   bucket has 10 tokens
  5 requests → 5 tokens consumed → bucket has 5
Time 1s:  bucket refills 2 tokens → bucket has 7
  3 requests → 3 tokens consumed → bucket has 4
Time 2s:  bucket refills 2 tokens → bucket has 6
  8 requests → 6 tokens consumed, 2 rejected → bucket has 0
Time 3s:  bucket refills 2 tokens → bucket has 2
```

Token bucket allows short bursts (up to the bucket capacity) while enforcing a long-term average rate (the refill rate). This matches real-world usage patterns where traffic is bursty, not uniform.

This is the most common algorithm in production systems (AWS API Gateway, Nginx, Redis-based rate limiters).

### The rate limit response contract

When a client is rate limited, return:

```
HTTP/1.1 429 Too Many Requests
Retry-After: 30
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1722086460

{"type": "rate-limit-exceeded", "title": "Rate limit exceeded", "detail": "Try again in 30 seconds"}
```

- `Retry-After` — how many seconds to wait (standardized HTTP header)
- `X-RateLimit-Limit` — the total allowed requests per window
- `X-RateLimit-Remaining` — how many requests remain in the current window
- `X-RateLimit-Reset` — Unix timestamp when the window resets

These headers let well-behaved clients back off gracefully instead of hammering your server.

### Rate limit by what?

- **API key**: standard for public APIs. Each key has its own limit.
- **User ID**: for authenticated APIs. Limits are per-user regardless of which device they use.
- **IP address**: weak — many users share IPs behind corporate NATs, VPNs, and carrier-grade NATs. One IP might represent thousands of users.
- **Endpoint-specific**: expensive endpoints (search, export, report generation) can have lower limits than simple reads.

---

## Part 12: CORS — Why Browsers Block Your API

### The problem CORS solves

CORS (Cross-Origin Resource Sharing) is a browser security mechanism. It has nothing to do with your server's security directly — it exists to protect *users* from malicious websites.

### Same-origin policy — the foundation

Browsers enforce the **same-origin policy**: JavaScript on `https://evil.com` cannot read responses from `https://your-api.com`. Two URLs have the same origin only if the **scheme, host, and port** all match:

```
https://api.example.com:443  ← origin

Same origin:
  https://api.example.com:443/books       ✓ (same scheme, host, port)
  https://api.example.com/books           ✓ (443 is default for https)

Different origin (cross-origin):
  http://api.example.com                  ✗ (different scheme)
  https://www.example.com                 ✗ (different host)
  https://api.example.com:8080            ✗ (different port)
  https://evil.com                        ✗ (different host)
```

Without this policy, `evil.com` could send a fetch request to `your-bank.com/api/accounts` (using the user's cookies that the browser automatically attaches) and read the response. The attacker gets the user's bank data.

### Why your `localhost:3000` frontend can't reach `localhost:4000` API

Your React dev server runs on `http://localhost:3000`. Your API runs on `http://localhost:4000`. Different ports = different origins. The browser blocks the response.

The browser *sends* the request. The server *processes* it and *sends* the response. But the browser **refuses to let JavaScript read the response** because the origins don't match.

This is critical to understand: CORS doesn't prevent the request from reaching the server. It prevents the browser JavaScript from reading the response.

### How CORS works — the mechanism

The server tells the browser "I allow requests from this origin" by including response headers:

```
Access-Control-Allow-Origin: https://my-frontend.com
```

When the browser sees this header on the response, it allows the JavaScript to read the response.

### Preflight requests — the OPTIONS mechanism

For "simple" requests (GET with no custom headers, POST with `application/x-www-form-urlencoded`), the browser sends the request directly and checks the CORS headers on the response.

For "non-simple" requests — anything with custom headers (like `Authorization`), `Content-Type: application/json`, or methods like PUT/PATCH/DELETE — the browser sends a **preflight** request first:

```
OPTIONS /books/42 HTTP/1.1
Host: api.example.com
Origin: https://my-frontend.com
Access-Control-Request-Method: PATCH
Access-Control-Request-Headers: Content-Type, Authorization
```

The browser is asking: "Before I send the real PATCH request with these headers, is that allowed?"

The server must respond:

```
HTTP/1.1 204 No Content
Access-Control-Allow-Origin: https://my-frontend.com
Access-Control-Allow-Methods: GET, POST, PATCH, DELETE
Access-Control-Allow-Headers: Content-Type, Authorization
Access-Control-Max-Age: 86400
```

Only after the preflight succeeds does the browser send the actual PATCH request.

**`Access-Control-Max-Age`** tells the browser how long to cache the preflight result. Without it, every non-simple request triggers two HTTP requests (OPTIONS + actual), doubling your request count.

### Why `Access-Control-Allow-Origin: *` is sometimes fine

For a truly public, unauthenticated API (like a public weather API), allowing all origins is correct:

```
Access-Control-Allow-Origin: *
```

But `*` cannot be used with `credentials: 'include'` (cookies, HTTP auth). If your API uses cookies for authentication, you must specify the exact origin:

```
Access-Control-Allow-Origin: https://my-frontend.com
Access-Control-Allow-Credentials: true
```

### CORS does not protect your API

CORS is a **browser** mechanism. `curl`, Postman, mobile apps, other servers — none of them enforce CORS. A malicious actor can call your API directly without any CORS restriction.

CORS protects *users* from malicious *websites* by preventing browser-based JavaScript from reading cross-origin responses. Your API is protected by authentication, authorization, rate limiting, and input validation — not CORS.

---

## Part 13: Versioning and API Evolution

### Why versioning is painful

Your API has external consumers — mobile apps, third-party integrations, other teams' services. These consumers:

- Deploy on different schedules than your backend
- May have old versions installed on user phones for months
- Built against your current contract and will break if it changes

### What is a breaking change?

A change is **breaking** if a correctly functioning client will malfunction after the change without updating its code.

**Breaking changes:**
- Removing a response field (`fullName` disappears)
- Renaming a response field (`fullName` → `name`)
- Changing a field's type (`"id": "42"` → `"id": 42`)
- Changing an endpoint's meaning
- Making a previously optional request field required
- Changing a pagination response structure
- Removing an endpoint
- Changing error response format

**Non-breaking (additive) changes:**
- Adding a new response field (clients that don't use it won't break)
- Adding a new endpoint
- Adding a new optional request field
- Adding a new enum value (if client handles unknown values gracefully)
- Widening an input constraint (accepting longer strings)

### The golden rule: prefer additive changes

Instead of renaming `fullName` to `name`:

1. Add `name` alongside `fullName`
2. Document `fullName` as deprecated
3. Wait for clients to migrate (monitor usage)
4. Remove `fullName` only after migration or after a communicated deadline

This requires discipline but prevents breaking deployed clients.

### Versioning strategies

**URL path versioning** — the most visible and debuggable:

```
/v1/books
/v2/books
```

Advantages: obvious in logs, URLs, documentation, and debugging. `curl /v1/books` tells you exactly which version.

Disadvantages: URL changes mean different cache entries, different bookmarks, and different documentation pages. If only one endpoint changes between v1 and v2, all endpoints still need to be available under both prefixes.

**Header versioning:**

```
GET /books
Accept: application/vnd.bookcase.v2+json
```

Advantages: URLs stay clean. Same endpoint handles both versions.

Disadvantages: harder to test (can't just change the URL in a browser), harder to see in logs, more complex routing.

**For most APIs**: URL path versioning is the pragmatic choice. The cost of a version bump is visible and manageable. Reserve header versioning for APIs with many consumers and frequent minor version bumps.

### Deprecation process

1. **Announce**: document the new version and migration guide
2. **Dual-run**: old and new versions work simultaneously
3. **Warn**: add `Deprecation` and `Sunset` headers to old version responses
4. **Measure**: track usage of the old version. Who is still calling v1?
5. **Communicate**: contact known consumers directly if possible
6. **Remove**: only after the deadline, with monitoring for 404 spikes

---

## Part 14: Webhooks — Your Server Becomes the Client

### What webhooks are

A webhook is an **outbound HTTP request** your server sends to a subscriber's URL when an event occurs. Instead of the subscriber polling your API ("any new borrows? any new borrows? any new borrows?"), your server pushes notifications to them.

```
Event: book borrowed
    ↓
Your server sends POST to subscriber's URL:

POST https://subscriber.example.com/webhooks
Content-Type: application/json
X-Webhook-Signature: sha256=abc123...

{
  "id": "evt_123",
  "type": "borrow.created",
  "occurredAt": "2026-07-27T10:00:00.000Z",
  "data": {
    "borrowId": "borrow_91",
    "bookId": "42",
    "memberId": "m_7"
  }
}
```

### Why at-least-once, not exactly-once

Consider this sequence:

```
1. Your server sends the webhook → network delivers it to subscriber
2. Subscriber processes it, creates a notification
3. Subscriber sends 200 OK back to you
4. 200 OK is lost in the network — you never receive it
5. You think delivery failed → you retry
6. Subscriber receives the same event again
```

From your perspective, step 3 never happened. You must retry. From the subscriber's perspective, they processed the event successfully and now receive it again.

This is why webhook delivery is **at-least-once**: the sender retries on any failure or timeout, which means successful events can be delivered more than once.

**Exactly-once delivery is impossible** across a network without shared state. The sender and receiver cannot agree on what happened when the acknowledgment is lost. (This is the same fundamental problem as the idempotency key problem in Part 8, but from the other direction.)

### The subscriber's responsibility: deduplicate

The subscriber must:

1. **Check the event ID** (`evt_123`) against a set of previously processed events
2. **If already processed**: return 200 immediately (acknowledge, but don't re-process)
3. **If new**: process the event, store the event ID, return 200

The event ID storage can be a database table with a unique constraint:

```sql
INSERT INTO processed_events (event_id, processed_at)
VALUES ('evt_123', NOW())
ON CONFLICT (event_id) DO NOTHING
RETURNING *;
```

If the insert returns a row, this is the first time — process the event. If it returns nothing (conflict), this is a duplicate — skip processing but return 200.

### Webhook signature verification

How does the subscriber know the webhook came from your server and not an attacker?

**Signing**: Before sending, your server computes a signature:

```javascript
const signature = crypto
  .createHmac('sha256', webhookSecret)
  .update(rawRequestBody)  // the exact bytes, not parsed JSON
  .digest('hex');

headers['X-Webhook-Signature'] = `sha256=${signature}`;
```

**Verification**: The subscriber computes the same signature and compares:

```javascript
const expected = crypto
  .createHmac('sha256', sharedSecret)
  .update(rawBody)  // must use raw bytes, not JSON.stringify(parsed)
  .digest('hex');

const received = req.headers['x-webhook-signature'].replace('sha256=', '');

if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(received))) {
  return res.status(401).json({error: 'Invalid signature'});
}
```

**Critical detail**: The signature must be computed over the **raw request body bytes**, not over a parsed-then-re-serialized JSON object. JSON serialization is not deterministic — `{"a":1,"b":2}` and `{"b":2,"a":1}` are semantically identical but produce different byte sequences and different signatures. Parse the JSON only after signature verification succeeds.

**`timingSafeEqual`**: Regular string comparison (`===`) short-circuits on the first mismatched character, which can leak information about the correct signature through timing differences. `timingSafeEqual` always takes the same amount of time regardless of how many characters match.

### Retry strategy

When delivery fails, use exponential backoff:

```
Attempt 1: immediately
Attempt 2: after 30 seconds
Attempt 3: after 2 minutes
Attempt 4: after 10 minutes
Attempt 5: after 1 hour
Attempt 6: after 6 hours
(give up after attempt 6)
```

Log every attempt — success or failure. Provide subscribers a way to view delivery history and replay failed events.

### Webhook handler rule: respond fast

A webhook handler should:

1. Verify the signature
2. Store the event (or queue it)
3. Return 200 immediately
4. Process the event asynchronously

If the handler does slow work synchronously (sending emails, calling external APIs), your server times out, retries, and the subscriber receives duplicates. Process the event in a background job, not in the HTTP handler.

---

## Part 15: REST vs GraphQL vs gRPC — Honest Tradeoffs

These are not better or worse than each other. They solve different problems. The choice depends on your consumers, your data access patterns, and your team's constraints.

### REST

**Strengths:**
- Simple and well-understood by everyone
- HTTP caching works naturally (Cache-Control, ETags, CDNs)
- Debuggable with `curl`, browser devtools, and any HTTP client
- Each endpoint has a clear, bounded scope
- Status codes provide standardized error handling

**Weaknesses:**
- Over-fetching: `GET /books/42` returns all fields even if the client only needs the title
- Under-fetching: getting a book with its author requires two requests (`GET /books/42` then `GET /authors/7`)
- Multiple round-trips for complex data views

**Best for:** public APIs, CRUD-heavy applications, simple client-server interactions, systems where HTTP caching matters.

### GraphQL

**How it works**: The client sends a query describing exactly what data it wants:

```graphql
query {
  book(id: "42") {
    title
    author {
      name
      bio
    }
    borrows(limit: 5) {
      borrowedAt
      member { name }
    }
  }
}
```

One request returns exactly the requested fields — no over-fetching, no under-fetching.

**Strengths:**
- Clients request exactly the data they need
- One endpoint, one round-trip for complex data views
- Strongly typed schema with introspection
- Excellent for diverse clients (mobile gets minimal data, web gets rich data)

**Weaknesses:**
- **N+1 queries**: The query above might execute: 1 query for the book, 1 for the author, 5 for borrows, 5 for members = 12 queries. DataLoader (batching and caching) is required but adds complexity.
- **Caching is hard**: HTTP caching doesn't work because every request is a POST to the same endpoint with a different body. You need application-level caching.
- **Authorization complexity**: Different fields might have different access rules. Checking permissions at every resolver level is complex.
- **Abuse**: A client can send deeply nested queries that consume enormous server resources. You need query depth limits and complexity analysis.
- **Error handling**: GraphQL always returns 200, with errors embedded in the response body. This breaks standard HTTP error handling and monitoring.

**Best for:** complex data models with diverse client needs, internal APIs serving multiple frontend applications, mobile apps on slow networks.

### gRPC

**How it works**: You define services and messages in `.proto` files:

```protobuf
service BookService {
  rpc GetBook (GetBookRequest) returns (Book);
  rpc ListBooks (ListBooksRequest) returns (stream Book);
}

message GetBookRequest {
  string id = 1;
}

message Book {
  string id = 1;
  string title = 2;
  string author = 3;
}
```

The gRPC compiler generates strongly-typed client and server code. Communication uses HTTP/2 with Protocol Buffers (binary serialization).

**Strengths:**
- Binary format: 3-10x smaller than JSON, faster to parse
- Code generation: type-safe clients in 10+ languages
- Four streaming modes: unary, server streaming, client streaming, bidirectional
- Built-in deadlines, cancellation, and metadata
- HTTP/2 multiplexing

**Weaknesses:**
- Cannot be called directly from browsers (need gRPC-Web or a REST gateway)
- Binary format is not human-readable — you can't `curl` a gRPC endpoint and read the response
- More complex tooling setup (protoc compiler, code generation pipeline)
- Harder to debug without specialized tools

**Best for:** internal service-to-service communication, polyglot microservice environments, streaming data, latency-sensitive systems.

### Decision framework

```
Browser-facing public API?         → REST
Multiple clients, complex data?    → GraphQL (with DataLoader, depth limits)
Internal service-to-service?       → gRPC (or REST if simplicity matters more)
Streaming requirements?            → gRPC or WebSockets
Simple CRUD?                       → REST (don't over-engineer)
```

---

## Part 16: Data Shapes That Survive Real Systems

Certain data representation choices cause bugs that are subtle and expensive to fix later.

### IDs should be strings in JSON

JavaScript numbers lose precision above `2^53`. If your database uses 64-bit integer IDs and you send `{"id": 9007199254740993}` in JSON, JavaScript parses it as `9007199254740992`. The client now has the wrong ID.

Use string IDs: `{"id": "9007199254740993"}` or, better, prefixed IDs: `{"id": "book_42"}`. Prefixed IDs are debuggable — if you see `book_42` in a log, you know it's a book. If you see `42`, it could be anything.

### Timestamps should be ISO 8601 strings

```json
{"borrowedAt": "2026-07-27T10:00:00.000Z"}
```

Not Unix timestamps (`1753617600`), not locale-specific formats (`"27/07/2026"`). ISO 8601 is unambiguous, sortable as a string, and parseable in every language.

Always include the timezone. `Z` means UTC. Without a timezone, the same timestamp means different moments depending on who reads it.

### Money should be integer minor units

Store 499 rupees as `49900` paise (integer). Not `499.00` (floating point).

Why? `0.1 + 0.2 === 0.30000000000000004` in JavaScript. Binary floating point cannot represent many decimal fractions exactly. When you sum up thousands of transactions, rounding errors accumulate.

```json
{"amount": 49900, "currency": "INR"}
```

The frontend formats `49900` as `₹499.00` for display. The backend never does floating-point arithmetic on money.

### Write models and read models should differ

A create request should not include server-owned fields:

```json
// CREATE - client sends
POST /books
{"title": "Dune", "author": "Frank Herbert"}

// READ - server returns
GET /books/42
{"id": "42", "title": "Dune", "author": "Frank Herbert", "createdAt": "2026-07-27T10:00:00.000Z", "availableCopies": 5, "borrowCount": 12}
```

The `id`, `createdAt`, `availableCopies`, and `borrowCount` are server-controlled. If a client can send `{"id": "anything", "borrowCount": 0}` and your server accepts it, you have a mass-assignment vulnerability.

---

## Part 17: Putting It All Together — A Complete API Design Checklist

Before adding any endpoint, answer these questions:

1. **What resource or domain event does this represent?** Name the resource. If you cannot name it, the endpoint is probably doing too much.

2. **Which HTTP method matches the intent?** Read = GET. Create = POST. Full replace = PUT. Partial update = PATCH. Remove = DELETE. If the method doesn't fit, model the action as a sub-resource creation.

3. **Where does each input belong?** Identity in path. Read modifiers in query. Metadata in headers. Data payload in body.

4. **What does success look like?** Which status code? What response body? What headers (Location, ETag, Cache-Control)?

5. **What failures can occur?** Invalid input (400/422). Not authenticated (401). Not authorized (403). Not found (404). State conflict (409). Stale version (412). Rate limited (429). Server error (500).

6. **What needs runtime validation?** Every field from the client. TypeScript types are not validation.

7. **What happens on retry?** Is the operation idempotent? If not, does it need an idempotency key?

8. **What happens with concurrent access?** Can two clients cause a lost update? Do you need ETags?

9. **Can the list grow unbounded?** What pagination strategy? What ordering? Is the ordering deterministic?

10. **Can this change later without breaking clients?** Are you using additive changes? Do you have a versioning strategy?

11. **Who can see this data?** Authentication, authorization, and what to never expose in error messages.

---

## Part 18: Common Misconceptions

### "REST means CRUD"

REST is an architectural style about resources, representations, and uniform interfaces. Many domain actions are better modeled as sub-resource creation than as CRUD. Borrowing a book is `POST /books/42/borrows`, not `PATCH /books/42`.

### "Status codes don't matter as long as I return errors in the body"

Status codes are parsed by HTTP clients, proxies, CDNs, load balancers, monitoring systems, and retry logic — all before your response body is read. `200` with an error body breaks all of these.

### "CORS protects my API"

CORS is a browser mechanism that protects users from malicious websites. It does not prevent server-to-server calls, `curl`, or mobile apps from accessing your API. Your API is protected by authentication and authorization.

### "GraphQL is better than REST"

GraphQL solves specific problems (over-fetching, multiple round-trips) but introduces others (N+1 queries, caching complexity, authorization at resolver level, query cost abuse). For simple CRUD APIs, REST is simpler and works better with HTTP caching.

### "Idempotency means identical responses"

Idempotency means the same intended *state change*. `DELETE /books/42` returning `204` first and `404` second is still idempotent — the state (book absent) is the same after both calls.

### "Validation in TypeScript types is enough"

TypeScript types are erased at runtime. `req.body` is `unknown` regardless of what type you assert. Runtime validation (zod, joi, or manual checks) is the actual protection.

### "PATCH is always idempotent"

Only if the operation sets absolute values. `{"copies": 3}` is idempotent. `{"incrementCopies": 1}` is not. Design matters.

### "Offset pagination is fine for everything"

Offset pagination is O(offset) in the database, unstable when data changes between pages, and breaks at scale. Cursor pagination is O(limit), stable, and efficient — but requires deterministic ordering.

---

## Part 19: Interview Questions You Should Be Ready For

After completing this week, you should be able to answer these from mechanism, not memory:

1. What is the difference between an API contract and a route handler?
2. Why are HTTP methods more than labels? What does "safe" and "idempotent" mean mechanistically?
3. A client times out on `POST /payments`. What exactly is the ambiguity? How do idempotency keys resolve it?
4. Explain the race condition when two idempotency key retries arrive simultaneously.
5. What is the difference between 400, 422, and 409?
6. Why is `200 {"success": false}` harmful?
7. Explain 401 vs 403 with a concrete example.
8. Why does offset pagination break at scale? How does cursor pagination solve it?
9. Why do cursors need a unique tie-breaker in the ordering?
10. What is a lost update? How do ETags and If-Match prevent it?
11. Explain the ETag-based caching flow (If-None-Match, 304 Not Modified).
12. How does the token bucket rate limiting algorithm work?
13. Why does CORS exist? What is a preflight request?
14. Why is webhook delivery at-least-once? What must the receiver do?
15. Why must webhook signature verification use the raw body bytes?
16. When would you choose REST over GraphQL? When would GraphQL be better?
17. Design `GET /orders` for a system with millions of orders.
18. A product manager wants to rename a field. What questions do you ask?
19. `POST /exports` takes 90 seconds. Design the contract.
20. What data representation choices prevent bugs? (IDs, timestamps, money)

---

## First-Principles Rules To Keep

1. An API is a contract, not a code implementation. Changing a field name is a contract change that can break every client.
2. HTTP methods are semantic promises. Safety and idempotency are relied upon by browsers, caches, proxies, and monitoring — not just your code.
3. Status codes are a machine-readable protocol. Return the correct one, or every layer of your infrastructure makes wrong decisions.
4. TypeScript types vanish at runtime. The HTTP boundary requires runtime validation.
5. Networks lose responses. Idempotency keys resolve the ambiguity of timeouts.
6. Concurrent access causes lost updates. ETags and If-Match provide optimistic concurrency control.
7. Unbounded lists break every layer. Cursor pagination is stable and efficient.
8. Rate limiting protects availability. Token bucket allows bursts while enforcing long-term rates.
9. CORS protects users in browsers, not your API. Your API is protected by auth and validation.
10. Webhook delivery is at-least-once. Receivers must deduplicate by event ID.
11. REST, GraphQL, and gRPC each solve different problems. Choose from tradeoffs, not trends.
12. Data shapes (string IDs, ISO timestamps, integer money) prevent entire categories of bugs.
