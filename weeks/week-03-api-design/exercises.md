# Week 3 Exercises — API Design

## Goal

Make API design rules tangible. Every exercise forces you to observe what happens when a rule is followed and what breaks when it is violated. The point is not "build a CRUD app" — it is to see, in running code, why each design decision exists.

All exercises use the same **Books API** from the notes. Use an in-memory array for storage — databases come in Week 5. Use Express or Fastify as the framework. The concepts are framework-agnostic.

For every exercise: **write the expected request and response before you write code**. Test with `curl`. Verify both the happy path and every failure case.

---

## Exercise 1: Build the Core API (Routes, Status Codes, Error Format)

Build a small Books API that demonstrates correct HTTP method usage, status codes, and a consistent error format.

### Why this exercise exists

Most developers learn "200 for success, 404 for not found" and stop there. This exercise forces you to implement the full range of status codes and see how each one communicates a different problem to the client. By the end, sending the wrong status code should feel obviously wrong — because you'll have seen what breaks.

### Requirements

Start with 5 hardcoded books in an array. Each book has: `id` (string), `title` (string), `author` (string), `availableCopies` (number), `version` (number starting at 1).

Implement these routes:

**`GET /books`** — returns all books as `{"items": [...]}`.

**`GET /books/:id`** — returns one book. Returns `404` if not found.

**`POST /books`** — creates a new book. Accepts `{"title": "...", "author": "..."}`. Returns `201` with the created book (server-generated string ID, `availableCopies` defaults to 1). Returns `Location` header pointing to the new book URL.

**`PATCH /books/:id`** — updates specified fields. Returns `200` with the updated book. Returns `404` if not found.

**`DELETE /books/:id`** — deletes a book. Returns `204` (no body). Returns `404` if not found.

**Error format**: Every error response must use this exact structure:

```json
{
  "type": "resource-not-found",
  "title": "Resource not found",
  "status": 404,
  "detail": "Book with ID 'xyz' does not exist",
  "requestId": "req_a1b2c3"
}
```

Create an `errorResponse(res, {type, title, status, detail, requestId})` helper. Every error in every route must use it.

**Request ID**: Add middleware that generates a unique ID for every request (`crypto.randomUUID()`) and attaches it to the request object. Include it in every response (header `X-Request-Id` and in error bodies).

### The tests (run each one)

```bash
# Success cases
curl -s http://localhost:3000/books | jq .
curl -s http://localhost:3000/books/book_1 | jq .
curl -s -X POST http://localhost:3000/books -H "Content-Type: application/json" -d '{"title":"Neuromancer","author":"William Gibson"}' -i
curl -s -X PATCH http://localhost:3000/books/book_1 -H "Content-Type: application/json" -d '{"title":"Dune: Revised"}' | jq .
curl -s -X DELETE http://localhost:3000/books/book_1 -i

# Failure cases
curl -s http://localhost:3000/books/nonexistent | jq .
curl -s -X DELETE http://localhost:3000/books/nonexistent -i
curl -s -X PATCH http://localhost:3000/books/nonexistent -H "Content-Type: application/json" -d '{"title":"X"}' | jq .
```

### After completing

Write answers to:

1. What status code did you return for `DELETE` on an already-deleted book? Is `DELETE` still idempotent if the second call returns `404` instead of `204`? Why or why not?
2. Why does the `POST` response include a `Location` header? What would a well-behaved client do with it?
3. What happens if you forget the `Content-Type: application/json` header on a POST request? Try it with curl (remove the `-H` flag). What does Express do?
4. Why is the request ID useful? Imagine a user reports "I got an error." How does the request ID help you find the problem in your server logs?

---

## Exercise 2: Validation at the HTTP Boundary

Prove that TypeScript types do not protect you at runtime, then build real validation.

### Why this exercise exists

This is the exercise that separates developers who understand HTTP from those who only understand their framework. You will send intentionally malformed, malicious, and edge-case payloads and observe what happens with naive code vs. proper validation. The goal is to make you viscerally uncomfortable with unvalidated input.

### Part A: The vulnerability demonstration

Add this naive route (intentionally bad code):

```typescript
app.post('/books/unsafe', (req, res) => {
  const book = req.body; // trust whatever came in
  books.push({ id: `book_${books.length + 1}`, ...book });
  res.status(201).json(books[books.length - 1]);
});
```

Now send these requests and observe what each one does:

```bash
# 1. Empty object — creates a book with no title
curl -s -X POST http://localhost:3000/books/unsafe -H "Content-Type: application/json" -d '{}'

# 2. Title is a number — silently accepted
curl -s -X POST http://localhost:3000/books/unsafe -H "Content-Type: application/json" -d '{"title":42,"author":"X"}'

# 3. Title is null — silently accepted
curl -s -X POST http://localhost:3000/books/unsafe -H "Content-Type: application/json" -d '{"title":null,"author":"X"}'

# 4. Whitespace-only title — looks valid but is meaningless
curl -s -X POST http://localhost:3000/books/unsafe -H "Content-Type: application/json" -d '{"title":"   ","author":"X"}'

# 5. Mass assignment — attacker sets fields they shouldn't control
curl -s -X POST http://localhost:3000/books/unsafe -H "Content-Type: application/json" -d '{"title":"Hack","author":"Eve","id":"admin_book","availableCopies":99999,"isAdmin":true}'

# 6. Huge payload — potential denial of service
curl -s -X POST http://localhost:3000/books/unsafe -H "Content-Type: application/json" -d "{\"title\":\"$(python3 -c "print('A'*100000)")\"}"

# 7. Not JSON at all
curl -s -X POST http://localhost:3000/books/unsafe -H "Content-Type: application/json" -d 'this is not json'

# 8. No Content-Type header
curl -s -X POST http://localhost:3000/books/unsafe -d '{"title":"Dune","author":"Herbert"}'
```

Inspect your books array after each request. Document what went wrong.

### Part B: Build proper validation

Now implement `POST /books` with real validation. Write a `validateCreateBook(body: unknown)` function that:

1. Rejects if `body` is not a non-null object
2. Rejects if `title` is not a string
3. Rejects if `title` is empty or whitespace-only after trimming
4. Rejects if `title` is longer than 500 characters
5. Rejects if `author` is not a string
6. Rejects if `author` is empty or whitespace-only after trimming
7. Accepts but ignores any extra fields (only picks `title` and `author` — prevents mass assignment)
8. Returns the cleaned data: `{ title: trimmedTitle, author: trimmedAuthor }`

Every validation failure returns `422` with field-level errors:

```json
{
  "type": "validation-error",
  "title": "Validation failed",
  "status": 422,
  "detail": "One or more fields are invalid",
  "requestId": "req_abc",
  "errors": [
    {"field": "title", "message": "Must be a non-empty string"},
    {"field": "author", "message": "Required"}
  ]
}
```

Add body size limiting middleware (reject bodies larger than 10KB).

### Part C: The null gotcha

Write a test that proves `typeof null === 'object'` in JavaScript. Then verify your validation correctly rejects `null` as a body. Many validators miss this because they check `typeof body === 'object'` without checking `body !== null`.

### After completing

Write answers to:

1. What specific damage could the mass assignment attack (test #5) cause in a real system with a database?
2. Why must validation use a whitelist approach (pick only known fields) rather than a blacklist approach (reject known bad fields)?
3. Where in the request lifecycle should body size limiting happen? Before or after JSON parsing? Why?
4. A colleague says "we use TypeScript, so the types guarantee the body is correct." Write a one-paragraph response explaining why they are wrong.

---

## Exercise 3: Design and Implement a Domain Action

Design the "borrow a book" operation as a sub-resource creation, implement it, and observe how state conflicts surface as status codes.

### Why this exercise exists

This exercise forces you to think through a domain action that is NOT simple CRUD. Borrowing a book involves checking availability, validating the member, creating a record, and decrementing a counter — atomically. You will see why `POST /books/:id/borrows` communicates intent better than `PATCH /books/:id`, and you will see 409 Conflict in action.

### Part A: Design the contract (write before code)

On paper or in a comment block, write:

1. The method and URL
2. The request body shape
3. The success response (status code, body shape, headers)
4. Every failure case with its status code:
   - Book does not exist
   - Member does not exist
   - Book has zero available copies
   - Request body is invalid (missing memberId)

### Part B: Implement it

Add a `members` array with 3 members and a `borrows` array (initially empty).

Implement `POST /books/:bookId/borrows`:

- Validate body: `memberId` is required and must be a string
- Check book exists → 404 if not
- Check member exists → 404 if not (or 422 — decide and document why)
- Check `availableCopies > 0` → 409 if not
- Create a borrow record with: `id`, `bookId`, `memberId`, `borrowedAt` (ISO timestamp), `dueAt` (14 days from now)
- Decrement `availableCopies` on the book
- Return `201` with the borrow record and `Location: /borrows/{id}` header

Also implement `GET /books/:bookId/borrows` — returns all borrows for that book.

### Part C: Observe the state conflict

```bash
# Set a book to 1 available copy first, then:

# Terminal 1: borrow the last copy
curl -s -X POST http://localhost:3000/books/book_1/borrows -H "Content-Type: application/json" -d '{"memberId":"member_1"}' | jq .

# Terminal 2: try to borrow the same book (should fail)
curl -s -X POST http://localhost:3000/books/book_1/borrows -H "Content-Type: application/json" -d '{"memberId":"member_2"}' | jq .
```

The second request should return `409 Conflict` with a clear message.

### After completing

Write answers to:

1. Why is `POST /books/:id/borrows` better than `PATCH /books/:id {"action": "borrow", "memberId": "..."}` for this operation?
2. You chose either 404 or 422 for "member does not exist." Defend your choice. What is the argument for the other option?
3. In a real system with a database, two borrow requests could arrive simultaneously when `availableCopies` is 1. Both check availability, both see 1, both proceed. How would you prevent this? (Hint: think about what you will learn in Week 5 about database transactions.)
4. Is this borrow operation idempotent? If the client retries after a timeout, could it create two borrow records? What would fix that?

---

## Exercise 4: Pagination — See Offset Break, Then Build Cursor

Implement both pagination strategies and observe offset pagination's instability.

### Why this exercise exists

Everyone says "cursor pagination is better" but few developers have actually watched offset pagination break. This exercise makes you see the duplicate/skip problem with your own eyes, then build cursor pagination and verify it doesn't have the same problem.

### Part A: Offset pagination

Seed 30 books (generate them programmatically with sequential IDs and timestamps).

Implement `GET /books?offset=0&limit=10`:

- Default limit: 10
- Maximum limit: 50
- Validate: offset must be a non-negative integer, limit must be a positive integer
- Sort by `createdAt` descending (newest first)
- Return: `{"items": [...], "page": {"offset": 0, "limit": 10, "total": 30}}`

Test:

```bash
# Page 1
curl -s "http://localhost:3000/books?offset=0&limit=10" | jq '.items | length'
# Page 2
curl -s "http://localhost:3000/books?offset=10&limit=10" | jq '.items[0].title'
# Invalid inputs
curl -s "http://localhost:3000/books?offset=-1&limit=10" | jq .
curl -s "http://localhost:3000/books?offset=abc&limit=10" | jq .
curl -s "http://localhost:3000/books?limit=200" | jq '.page.limit'
```

### Part B: Break it

Now do this exact sequence and observe the problem:

```bash
# Step 1: Get page 1
curl -s "http://localhost:3000/books?offset=0&limit=10" | jq '.items[-1].title'
# Note the last book's title on page 1

# Step 2: Insert a new book (it will appear at the top of the list because it's newest)
curl -s -X POST http://localhost:3000/books -H "Content-Type: application/json" -d '{"title":"INSERTED BETWEEN PAGES","author":"Test"}'

# Step 3: Get page 2
curl -s "http://localhost:3000/books?offset=10&limit=10" | jq '.items[0].title'
# Is the first book on page 2 the same as the last book on page 1? You just saw a DUPLICATE.
```

Document exactly what happened: which book appeared twice, and why the offset shift caused it.

### Part C: Cursor pagination

Implement `GET /books?limit=10` (first page) and `GET /books?limit=10&cursor=...` (subsequent pages).

Cursor design:
- Sort by `createdAt` descending, then `id` descending (tie-breaker)
- The cursor is a base64-encoded JSON object: `{"createdAt": "...", "id": "..."}`
- The server decodes the cursor and filters: return books where `(createdAt, id) < (cursor.createdAt, cursor.id)`
- Response includes `nextCursor` (null if no more items) and `hasMore` (boolean)

```json
{
  "items": [...],
  "page": {
    "limit": 10,
    "nextCursor": "eyJjcmVhdGVkQXQiOi...",
    "hasMore": true
  }
}
```

### Part D: Prove cursor pagination is stable

Repeat the same test as Part B — get page 1, insert a book, get page 2 using the cursor. Verify that the item that was last on page 1 does NOT appear again on page 2.

```bash
# Get page 1, save the cursor
CURSOR=$(curl -s "http://localhost:3000/books?limit=10" | jq -r '.page.nextCursor')

# Insert a new book
curl -s -X POST http://localhost:3000/books -H "Content-Type: application/json" -d '{"title":"INSERTED BETWEEN PAGES V2","author":"Test"}'

# Get page 2 using the cursor — no duplicate!
curl -s "http://localhost:3000/books?limit=10&cursor=$CURSOR" | jq '.items[0].title'
```

### After completing

Write answers to:

1. Why did offset pagination show a duplicate after the insertion?
2. Why does cursor pagination avoid this problem?
3. If two books have the exact same `createdAt` timestamp, what would happen without the `id` tie-breaker in the cursor? Demonstrate or explain.
4. Why should the cursor be opaque (base64-encoded) to the client?
5. Can the client jump to "page 5" with cursor pagination? Why is this a tradeoff?

---

## Exercise 5: Idempotency Keys — Prevent Duplicate Payments

Build an endpoint that proves idempotency keys prevent duplicate creation despite network retries.

### Why this exercise exists

The notes explain why network timeouts create ambiguity. This exercise makes you live it. You will simulate a "lost response" and watch what happens with and without idempotency keys — first a duplicate creation, then the key preventing it.

### Part A: The problem without idempotency keys

Implement `POST /payments` (no idempotency key yet):

- Body: `{"memberId": "member_1", "amountInPaise": 49900}`
- Creates a payment record with a unique ID, returns `201`

```bash
# Simulate a "retry" — same request sent twice
curl -s -X POST http://localhost:3000/payments -H "Content-Type: application/json" -d '{"memberId":"member_1","amountInPaise":49900}' | jq .
curl -s -X POST http://localhost:3000/payments -H "Content-Type: application/json" -d '{"memberId":"member_1","amountInPaise":49900}' | jq .

# Check: two different payment IDs. The member was charged twice.
curl -s http://localhost:3000/payments | jq .
```

### Part B: Fix it with idempotency keys

Modify `POST /payments` to accept an `Idempotency-Key` header.

Logic:
1. Extract the key and the authenticated member (use `memberId` from the body for this exercise)
2. Create a composite lookup key: `${memberId}:${idempotencyKey}`
3. If this composite key already exists in your store:
   - Compare the stored request body hash with the current request body hash
   - If they match → return the stored response (same status code and body)
   - If they don't match → return `409 Conflict` ("This idempotency key was already used with a different request")
4. If the composite key does not exist:
   - Create the payment
   - Store the composite key, body hash, and response
   - Return `201`

### Part C: Test every scenario

```bash
# Test 1: First request succeeds
curl -s -X POST http://localhost:3000/payments -H "Content-Type: application/json" -H "Idempotency-Key: key_001" -d '{"memberId":"member_1","amountInPaise":49900}' | jq .

# Test 2: Same key, same body → returns the SAME payment (not a new one)
curl -s -X POST http://localhost:3000/payments -H "Content-Type: application/json" -H "Idempotency-Key: key_001" -d '{"memberId":"member_1","amountInPaise":49900}' | jq .
# Verify: same payment ID as Test 1

# Test 3: Same key, different body → 409 Conflict
curl -s -X POST http://localhost:3000/payments -H "Content-Type: application/json" -H "Idempotency-Key: key_001" -d '{"memberId":"member_1","amountInPaise":99900}' | jq .

# Test 4: Different key, same body → new payment (different intent)
curl -s -X POST http://localhost:3000/payments -H "Content-Type: application/json" -H "Idempotency-Key: key_002" -d '{"memberId":"member_1","amountInPaise":49900}' | jq .
# Verify: different payment ID from Test 1

# Test 5: Same key from different member → no collision
curl -s -X POST http://localhost:3000/payments -H "Content-Type: application/json" -H "Idempotency-Key: key_001" -d '{"memberId":"member_2","amountInPaise":49900}' | jq .
# Verify: new payment (different member, same key is fine)

# Test 6: No idempotency key → 400 (require the key for this endpoint)
curl -s -X POST http://localhost:3000/payments -H "Content-Type: application/json" -d '{"memberId":"member_1","amountInPaise":49900}' | jq .
```

### After completing

Write answers to:

1. Describe the exact network scenario where the first request succeeds on the server but the client still retries. Draw it as a sequence diagram.
2. Why is the idempotency key scoped to the member (composite key) rather than global?
3. Why do you reject reuse of a key with a different body (Test 3) instead of silently returning the old response?
4. In a real system with a database, two retries with the same key could arrive simultaneously. Both check the store, both find nothing, both try to create a payment. How would you prevent this with a database? (Hint: unique constraint + INSERT ... ON CONFLICT.)

---

## Exercise 6: ETags — Detect and Prevent Lost Updates

Add optimistic concurrency control to your Books API and observe it preventing a lost update.

### Why this exercise exists

Lost updates are silent data corruption. Two users edit the same resource, and one user's changes are silently overwritten. This exercise makes you watch it happen, then fix it with ETags. The "aha moment" is seeing the 412 response that saves Client B from overwriting Client A's work.

### Part A: The lost update without ETags

Use your PATCH endpoint from Exercise 1 (no ETag check yet):

```bash
# Two "clients" read the same book
curl -s http://localhost:3000/books/book_1 | jq .title
# Both see "Dune"

# Client A changes the title
curl -s -X PATCH http://localhost:3000/books/book_1 -H "Content-Type: application/json" -d '{"title":"Dune: Special Edition"}' | jq .title

# Client B, still looking at old data, changes the title
curl -s -X PATCH http://localhost:3000/books/book_1 -H "Content-Type: application/json" -d '{"title":"Dune: Collectors Edition"}' | jq .title

# Result: Client A's change is silently gone. Lost update.
curl -s http://localhost:3000/books/book_1 | jq .title
```

### Part B: Add ETags

Modify your API:

1. **`GET /books/:id`** — include an `ETag` header with the book's version: `ETag: "3"` (use the `version` field from Exercise 1)

2. **`PATCH /books/:id`** — require an `If-Match` header:
   - If `If-Match` is missing → return `428 Precondition Required` with a message explaining the ETag requirement
   - If `If-Match` value matches the book's current version → apply the update, increment version, return `200` with new `ETag`
   - If `If-Match` value does NOT match → return `412 Precondition Failed`

### Part C: Watch the 412 save you

```bash
# Client A reads the book, notes the ETag
curl -s -i http://localhost:3000/books/book_1 | grep -i etag
# ETag: "1"

# Client B reads the same book, notes the same ETag
# (same version)

# Client A updates with correct ETag
curl -s -X PATCH http://localhost:3000/books/book_1 -H "Content-Type: application/json" -H 'If-Match: "1"' -d '{"title":"Dune: Special Edition"}' -i | head -5
# 200 OK, ETag: "2"

# Client B tries to update with the OLD ETag
curl -s -X PATCH http://localhost:3000/books/book_1 -H "Content-Type: application/json" -H 'If-Match: "1"' -d '{"title":"Dune: Collectors Edition"}' | jq .
# 412 Precondition Failed — Client B is told: "your data is stale"

# Client B must now re-read, see the updated title, and decide what to do
curl -s http://localhost:3000/books/book_1 | jq .
```

### Part D: ETag for caching (If-None-Match / 304)

Add support for conditional GET requests:

- Client sends `GET /books/:id` with `If-None-Match: "2"`
- If the book's version matches → return `304 Not Modified` with no body
- If it doesn't match → return `200` with the full body and new ETag

```bash
# First request: full response
curl -s -i http://localhost:3000/books/book_1 | head -10

# Second request with If-None-Match: 304 and no body
curl -s -i http://localhost:3000/books/book_1 -H 'If-None-Match: "2"' | head -5
# HTTP/1.1 304 Not Modified

# After updating the book, same If-None-Match returns 200 with new data
curl -s -X PATCH http://localhost:3000/books/book_1 -H "Content-Type: application/json" -H 'If-Match: "2"' -d '{"author":"Frank Herbert (updated)"}'
curl -s -i http://localhost:3000/books/book_1 -H 'If-None-Match: "2"' | head -10
# HTTP/1.1 200 OK, ETag: "3", full body
```

### After completing

Write answers to:

1. What data must Client B fetch after receiving 412? What should a UI do — show an error, auto-merge, or force the user to choose?
2. What is the difference between `If-Match` (used in PATCH) and `If-None-Match` (used in GET)? Why are they named that way?
3. How much bandwidth does the 304 response save? Compare the byte sizes of a 200 response and a 304 response for the same book.
4. Could you use a hash of the response body as the ETag instead of a version counter? What are the tradeoffs?

---

## Exercise 7: CORS — See the Browser Block, Then Fix It

Observe CORS in action by building a frontend that tries to call your API from a different origin.

### Why this exercise exists

CORS confuses everyone because you can't see it in `curl` or Postman — those tools don't enforce it. You must use a browser. This exercise makes you watch the browser block your API, understand the preflight mechanism, and fix it correctly.

### Part A: Create the problem

1. Your API is running on `http://localhost:3000`

2. Create a simple HTML file and serve it on a different port (e.g., `http://localhost:8080`):

```html
<!DOCTYPE html>
<html>
<head><title>CORS Test</title></head>
<body>
  <h1>CORS Test</h1>
  <button id="get-btn">GET /books (simple)</button>
  <button id="post-btn">POST /books (preflight)</button>
  <pre id="output"></pre>
  <script>
    const API = 'http://localhost:3000';
    const output = document.getElementById('output');

    document.getElementById('get-btn').addEventListener('click', async () => {
      try {
        const res = await fetch(`${API}/books`);
        output.textContent = `Status: ${res.status}\n${await res.text()}`;
      } catch (e) {
        output.textContent = `BLOCKED: ${e.message}`;
      }
    });

    document.getElementById('post-btn').addEventListener('click', async () => {
      try {
        const res = await fetch(`${API}/books`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: 'From Browser', author: 'Test' })
        });
        output.textContent = `Status: ${res.status}\n${await res.text()}`;
      } catch (e) {
        output.textContent = `BLOCKED: ${e.message}`;
      }
    });
  </script>
</body>
</html>
```

Serve it: `npx -y serve -l 8080` (or any simple file server) in the directory containing this HTML file.

3. Open `http://localhost:8080` in your browser. Click both buttons. Open the browser's DevTools Network tab.

**Observe:**
- Both requests are BLOCKED. The `fetch` throws an error.
- In the Network tab, the GET might show a response but the browser refuses to let JavaScript read it.
- For the POST, you'll see an OPTIONS preflight request that fails.

### Part B: Fix it with CORS headers

Add CORS middleware to your API server:

```javascript
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', 'http://localhost:8080');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, If-Match, If-None-Match, Idempotency-Key');
  res.setHeader('Access-Control-Expose-Headers', 'ETag, X-Request-Id, Location');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  next();
});
```

Reload the browser page. Click both buttons. They should work now.

### Part C: Inspect the preflight

In the Network tab, find the OPTIONS request for the POST. Examine:

- What request headers did the browser send? (`Origin`, `Access-Control-Request-Method`, `Access-Control-Request-Headers`)
- What response headers did your server return?
- After the OPTIONS succeeded, did the browser send the actual POST?

### After completing

Write answers to:

1. Why did `curl` never have this problem? Test the same endpoints with `curl` — do they work without CORS headers?
2. What is the preflight OPTIONS request? Why does the browser send it for POST with `Content-Type: application/json` but not for a simple GET?
3. What does `Access-Control-Max-Age: 86400` do? What happens if you remove it — does the browser send OPTIONS for every single POST?
4. What does `Access-Control-Expose-Headers` do? Without it, can the browser JavaScript read the `ETag` header from the response? Test it.
5. Why is `Access-Control-Allow-Origin: *` sometimes acceptable and sometimes dangerous? When would you NOT use `*`?

---

## Exercise 8: Rate Limiting — Build a Token Bucket

Implement rate limiting from scratch and observe it protecting your server.

### Why this exercise exists

Using a rate limiting library is easy. Understanding _how_ it works — and what algorithm to choose — requires implementing one. This exercise builds a token bucket, the most common algorithm in production systems (AWS API Gateway, Nginx, Redis-based limiters).

### Requirements

Implement a token bucket rate limiter as middleware:

**Algorithm:**
- Each client (identified by a key, e.g., IP address for now) gets a bucket
- Bucket capacity: 10 tokens (maximum burst)
- Refill rate: 2 tokens per second
- Each request costs 1 token
- If the bucket is empty → return `429 Too Many Requests` with `Retry-After` header

**Implementation details:**
- Store buckets in a `Map<string, { tokens: number, lastRefill: number }>`
- On each request: calculate elapsed time since last refill, add tokens (capped at capacity), then consume 1 token
- Include these response headers on every request:
  - `X-RateLimit-Limit: 10` (bucket capacity)
  - `X-RateLimit-Remaining: <tokens left>`

### The test

```bash
# Rapid-fire 12 requests (only 10 should succeed)
for i in $(seq 1 12); do
  echo -n "Request $i: "
  curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/books
  echo ""
done

# Wait 3 seconds (6 tokens refill at 2/second)
sleep 3

# These should succeed
for i in $(seq 1 6); do
  echo -n "Request $i: "
  curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/books
  echo ""
done
```

Expected: first 10 return 200, requests 11-12 return 429. After waiting 3 seconds, 6 more succeed.

### After completing

Write answers to:

1. Why does the token bucket allow a short burst (10 rapid requests) followed by a sustained rate (2/second)? Why is this better than a fixed "2 requests per second" limit?
2. What would happen if you identified clients by IP address only, and 500 users were behind the same corporate NAT?
3. In a system with multiple server instances behind a load balancer, each server has its own token bucket Map. What's the problem? How would you solve it? (Hint: Redis.)
4. What is the difference between the token bucket algorithm you built and a fixed window counter?

---

## Exercise 9: Webhook Receiver with Signature Verification and Deduplication

Build a complete webhook receiver that verifies signatures and handles duplicate deliveries.

### Why this exercise exists

Exercises 5 (idempotency keys) taught you the sender's perspective on duplicate prevention. This exercise teaches the receiver's perspective. You will implement HMAC signature verification, event deduplication, and fast acknowledgment — the three things every production webhook receiver needs.

### Part A: Build the webhook sender (simulating a provider)

Create a small script that sends signed webhook events:

```javascript
const crypto = require('crypto');

const WEBHOOK_SECRET = 'whsec_test_secret_key';
const RECEIVER_URL = 'http://localhost:3000/webhooks/book-events';

async function sendWebhook(event) {
  const body = JSON.stringify(event);
  const signature = crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(body)
    .digest('hex');

  const res = await fetch(RECEIVER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Webhook-Signature': `sha256=${signature}`,
      'X-Webhook-Id': event.id,
    },
    body: body,
  });
  console.log(`Sent ${event.id}: ${res.status}`);
}

// Send the same event twice (simulating a retry)
const event = {
  id: 'evt_abc123',
  type: 'borrow.created',
  occurredAt: new Date().toISOString(),
  data: { borrowId: 'borrow_91', bookId: '42', memberId: 'member_1' },
};

sendWebhook(event);
setTimeout(() => sendWebhook(event), 500); // "retry" after 500ms
```

### Part B: Build the webhook receiver

Implement `POST /webhooks/book-events`:

1. **Signature verification (BEFORE parsing):**
   - Read the raw body (you need Express raw body middleware or equivalent)
   - Compute HMAC-SHA256 of the raw body using your secret
   - Compare with the `X-Webhook-Signature` header using `crypto.timingSafeEqual`
   - If invalid → return `401` immediately

2. **Deduplication:**
   - Check the event `id` against a `Set` of processed event IDs
   - If already processed → return `200` immediately (acknowledge but don't re-process)
   - If new → add to the Set, process the event

3. **Processing:**
   - Log the event: `"Processing event: evt_abc123 type: borrow.created"`
   - Simulate a side effect (e.g., incrementing a counter, logging to a file)
   - Return `200`

4. **Test with tampered payload:**

```bash
# Send a request with a wrong signature
curl -s -X POST http://localhost:3000/webhooks/book-events \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Signature: sha256=wrong" \
  -H "X-Webhook-Id: evt_tampered" \
  -d '{"id":"evt_tampered","type":"borrow.created","data":{}}' | jq .
# Should return 401
```

### Part C: Verify deduplication

Run the sender script from Part A. Check your server logs:

- The event should be processed **once** (one "Processing event" log)
- The second delivery should return 200 immediately without processing
- Your side-effect counter should be 1, not 2

### After completing

Write answers to:

1. Why must signature verification happen on the RAW body bytes, not on `JSON.stringify(JSON.parse(body))`? What could change when you parse and re-serialize?
2. Why does the code use `crypto.timingSafeEqual` instead of `===` for signature comparison?
3. In a real system, the processed events Set would grow forever. How would you handle this? (Hint: TTL, database with expiry, or capped collection.)
4. Why should the webhook handler respond quickly (200) and process slow work asynchronously?
5. The sender sees a timeout after 30 seconds. Did the receiver process the event or not? Why is this the same fundamental ambiguity as the payment idempotency problem?

---

## Exercise 10: REST vs GraphQL vs gRPC Decision Memos

Write structured decision memos for three real scenarios.

### Why this exercise exists

"When should I use GraphQL?" is a common interview question. This exercise forces you to reason through real tradeoffs — not just name the technologies but explain why one fits better than the others for a specific situation.

### The scenarios

For each scenario, write a decision memo (8-15 sentences) that includes:
- Your recommended interface style
- The top 2 reasons for your choice
- What the main drawback of your choice is
- Why the other two options are worse for this specific case

**Scenario 1:** A public book catalog API. Third-party developers build reading list apps, bookstore integrations, and library management tools. They need to search, list, and read book details. No writes except from your admin team. Caching is important because the catalog changes infrequently.

**Scenario 2:** An internal dashboard for library staff. Different screens show different combinations: book details with current borrowers, member profiles with borrow history, overdue borrows with book and member details. The frontend team complains about needing 3-4 REST calls per screen. The data model has many relationships.

**Scenario 3:** Two internal microservices that communicate at high volume. The Inventory Service notifies the Notification Service when a book is returned (to alert members on the waitlist). Messages are typed, latency matters, and both services are written in different languages (Go and Node.js).

### After completing

For each memo, write one follow-up sentence answering: "What would have to change about this scenario to make you switch to a different choice?"

---

## Project Piece

This week's contribution to the capstone:

Build the **Books API** as a standalone Express application with:

- Full CRUD for books (GET list, GET one, POST, PATCH, DELETE)
- Borrow operation (`POST /books/:id/borrows`)
- Consistent error format (RFC 9457-style)
- Request ID middleware
- Input validation (runtime, not TypeScript-only)
- Cursor pagination on the list endpoint
- ETag support for reads and writes (If-Match on PATCH, If-None-Match on GET)
- CORS middleware
- Rate limiting middleware (token bucket)
- A health check endpoint: `GET /health` → `{"status": "ok"}`

All in-memory — no database yet. This becomes the API layer of your capstone that you'll connect to a real database in Week 5.

---

## Pass Gate

You do not pass because the code runs.

You pass if:

- You can send intentionally malicious input and show how your validation rejects it
- You can demonstrate offset pagination breaking (duplicate item) and cursor pagination being stable
- You can explain what idempotency keys solve by describing the exact network failure scenario
- You can simulate two concurrent edits and show the ETag-based 412 preventing a lost update
- You can open a browser, click a button, see CORS block the request, and explain what the preflight OPTIONS does
- You can show your rate limiter allowing a burst of 10, rejecting request 11, then recovering after time passes
- You can receive the same webhook twice and show the side effect happened only once
- Your explanations reference the mechanism (what the browser does, what the server checks, what the header means) — not just the library function you called

