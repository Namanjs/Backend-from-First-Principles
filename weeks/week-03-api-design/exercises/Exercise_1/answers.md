# Exercise 1: Reflection Answers

---

### Q1. What status code did you return for `DELETE` on an already-deleted book? Is `DELETE` still idempotent if the second call returns `404` instead of `204`? Why or why not?

**Answer:**
- First `DELETE` returned `204 No Content`.
- Second `DELETE` returned `404 Not Found`.

**Yes, `DELETE` is still idempotent.**
Idempotency means that executing a request $N$ times leaves the server in the **exact same state** as executing it once. After the first `DELETE`, the resource is gone. Every subsequent `DELETE` leaves the server state unchanged (the resource remains gone), regardless of whether the HTTP status code returned is `204` or `404`.

---

### Q2. Why does the `POST` response include a `Location` header? What would a well-behaved client do with it?

**Answer:**
The `Location` header (e.g., `Location: /books/6fc86f27...`) tells the client the canonical URI of the newly created resource.

A well-behaved client (like a frontend router or API client library) reads the `Location` header to:
1. Know where to send future `GET`, `PATCH`, or `DELETE` requests for this item.
2. Automatically redirect or update the browser URL without having to guess or construct the URI manually.

---

### Q3. What happens if you forget the `Content-Type: application/json` header on a POST request? What does Express do?

**Answer:**
Express's `express.json()` body-parser middleware checks incoming request headers. If `Content-Type: application/json` is missing, `express.json()` **ignores the request body entirely** and does not attempt to parse it.

As a result, `req.body` defaults to an empty object `{}`. When your route handler tries to destructure `{ title, author } = req.body`, both variables end up as `undefined`.

---

### Q4. Why is the request ID useful? Imagine a user reports "I got an error." How does the request ID help you find the problem in your server logs?

**Answer:**
In production systems, thousands of requests from different users execute concurrently, causing server log lines to interleave heavily.

If a user reports an error with their `requestId` (e.g., `2cb6b220-62a9-4e2f-9ad5-1e007d2d5e31`), an engineer can query centralized logging systems (like CloudWatch, Datadog, or Kibana) using `requestId === "2cb6b220..."`. This instantly filters out all noise and isolates the exact trace, logs, and stack trace associated with that specific failed request.