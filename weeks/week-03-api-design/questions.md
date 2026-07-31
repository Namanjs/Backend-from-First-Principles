# Week 3 Questions and Corrected Answers

Read the question, attempt a short answer aloud, then read the answer. These are not prompts you must solve alone. They are the correction sheet for the ideas in this week.

---

## A. API contracts and resources

### 1. Why is an API a contract rather than just a set of routes?

**Answer:** A route is server code. An API contract is the externally visible agreement: method, URL, parameters, headers, body shape, status codes, and response shape. Clients build against that agreement. If the server changes a response field from a string to a number, the route may still run, but clients can break. That is why API changes must be treated as contract changes.

### 2. What is the difference between a resource and a representation?

**Answer:** A resource is the real domain thing with an identity, such as book 42. A representation is the data sent to describe it, normally JSON. The book can remain the same resource while its representation changes, for example a short list view versus a detailed view.

### 3. What useful constraints does REST give us? What does REST not require?

**Answer:** REST encourages stable resource URLs, meaningful HTTP methods, standard response semantics, and self-contained requests. It does not mean every endpoint must be perfect CRUD, every response needs links, or that REST is always better than GraphQL or gRPC. The goal is predictable HTTP behaviour.

### 4. Why is GET /orders/ord_123?do=cancel a bad design?

**Answer:** GET is meant for reading and is safe. A cache, browser prefetcher, crawler, or monitoring tool may repeat GET requests. Cancelling an order changes state, so hiding it in GET creates dangerous accidental side effects. Use a state-changing method such as POST for the cancellation operation.

### 5. When is POST /orders/ord_123/cancel better than forcing an action into CRUD?

**Answer:** Use an operation endpoint when the action has important domain meaning and does more than edit one ordinary field. Cancelling may check permissions, inventory, refund rules, and create an audit record. The endpoint makes that behaviour visible. If cancellation produces a resource such as a refund, the response can return it.

### 6. Distinguish path, query, header, and body with one example.

**Answer:** In PATCH /books/42?dryRun=true, 42 is a path parameter identifying the book. dryRun is a query parameter adjusting this request. Authorization is a header carrying request metadata. The JSON body contains fields to change, such as a new title. Identity goes in path, list/read options in query, protocol metadata in headers, and created or changed data in body.

### 7. Why should nesting communicate scope rather than mirror every database relation?

**Answer:** Database tables often have many relationships. Copying all of them into nested URLs leads to long, confusing paths. Nest when a child is naturally scoped by its parent, such as POST /books/42/borrows. Use a top-level resource with filters when the resource is independently useful, such as GET /borrows?memberId=m_7.

---

## B. HTTP method semantics

### 8. What is a safe HTTP method, and why does it matter?

**Answer:** A safe method does not intentionally change business state. GET should read only. This matters beyond your code because browsers, caches, link checkers, and monitoring systems may repeat or prefetch safe requests. If GET deletes or charges, those systems can trigger real damage.

### 9. Define idempotency precisely. Does it require identical responses?

**Answer:** An operation is idempotent when repeating it has the same intended final effect as doing it once. It does not require identical responses. Deleting an already deleted resource might return 204 first and 404 later, while the final state remains absent.

### 10. Why are PUT and DELETE generally idempotent while POST normally is not?

**Answer:** PUT sets a resource to a specified representation, so repeating the same complete replacement leaves the same final state. DELETE leaves the resource absent, even when repeated. POST commonly asks the server to create a new subordinate resource, so repeating it can create two payments, orders, or borrow records.

### 11. A payment request times out. What exact ambiguity exists?

**Answer:** The request may never have reached the server, may be processing, or may have completed successfully while the response was lost. The client cannot safely assume either success or failure. Retrying blindly can charge twice; refusing to retry can leave the user uncertain. Idempotency keys let the server resolve this ambiguity.

### 12. When would you choose POST, PUT, and PATCH?

**Answer:** Use POST when the server chooses a new ID or when submitting a command that creates a result. Use PUT when the client knows the resource URL and sends its full replacement. Use PATCH when changing only specified fields. An underspecified PUT is dangerous because it is unclear whether omitted fields should be erased, preserved, or defaulted.

### 13. Why can PATCH be non-idempotent?

**Answer:** PATCH describes an operation, and some operations compound. Setting availableCopies to 3 is idempotent because repetition ends at 3. Increasing availableCopies by 1 is non-idempotent because repetition produces 4, then 5, and so on.

---

## C. Status codes and error contracts

### 14. Explain 400, 422, and 409.

**Answer:** 400 means the server cannot correctly understand the request, for example malformed JSON or a field of the wrong type. 422 means the request is understandable but invalid, for example a title containing only spaces. 409 means the request conflicts with current state, for example trying to borrow a book with zero available copies. Teams vary on the exact 400 versus 422 boundary; consistency matters most.

### 15. Explain 401 versus 403.

**Answer:** 401 means authentication is missing or invalid: the server cannot accept the supplied identity. 403 means the server knows the identity but denies permission. The word Unauthorized in 401 is historical and confusing; in practice 401 is an authentication problem and 403 is an authorization problem.

### 16. When is 202 Accepted honest, and what should accompany it?

**Answer:** Return 202 when work was accepted but is not finished, such as a 90-second export. Return a job ID, status URL, and preferably an estimated next action. For example, POST /exports can return 202 with a Location header pointing to GET /exports/job_1.

### 17. When should you return 412 rather than 409?

**Answer:** Use 412 Precondition Failed when the client supplied an explicit HTTP precondition that failed, commonly If-Match with an old ETag. Use 409 for a broader conflict with current business state, such as a book becoming unavailable. Both describe a conflict, but 412 specifically points to a failed requested condition.

### 18. Why is 200 with success false weak for errors?

**Answer:** HTTP tools, clients, monitoring, retries, and caches use status codes before reading the body. Returning 200 says success at the protocol level even when work failed. Every client then needs custom body parsing to discover errors. Use the correct status code and an error body.

### 19. What should a stable error response contain, and what must not leak?

**Answer:** Include a stable category, short title, status, specific detail, request ID, and field errors where appropriate. Never expose stack traces, SQL queries, database internals, tokens, passwords, private user data, or implementation details that help an attacker.

### 20. What does application/problem+json solve, and why should clients not parse detail text?

**Answer:** Problem Details gives APIs a common structured error format so clients can consistently find status, type, title, and detail. Detail is written for humans and may be edited, translated, or made more specific. Clients should branch on stable type values or error codes, not on sentence text.

---

## D. Validation, pagination, and compatibility

### 21. Why is HTTP-boundary validation not sufficient by itself?

**Answer:** Validation checks one request shape. It cannot alone protect rules involving changing shared state. Two requests can both pass validation that a book has one copy left, then both try to borrow it. The business and storage layer must enforce the availability rule atomically or through concurrency control.

### 22. Compare offset and cursor pagination.

**Answer:** Offset pagination says skip N results and take a limit. It is easy for page-number UIs but can be slow for deep pages and unstable when rows change. Cursor pagination says continue after a specific ordered item. It is more stable and efficient for large, changing lists but requires deterministic ordering and opaque cursors. If a new row appears at the start between offset pages, an item can shift and be duplicated or skipped.

### 23. Why does cursor pagination need deterministic order and a unique tie breaker?

**Answer:** The cursor marks an exact position in an ordered list. If two rows share the same created time and there is no tie breaker, the server cannot reliably decide which one comes next. Use an order such as createdAt plus ID so every item has one stable place.

### 24. Which changes are usually backward compatible, and which are breaking?

**Answer:** Adding an optional field, endpoint, or optional request input is usually compatible. Removing or renaming fields, changing types, changing endpoint meaning, making optional input required, or changing response shapes is breaking. Existing clients may rely on the old contract.

### 25. Compare URL versioning with header versioning. What would you choose first?

**Answer:** URL versioning, such as /v1/books, is obvious in logs, docs, browsers, and tests. Header or media-type versioning keeps URLs cleaner but is less visible and more complex to debug. For a first public API, URL versioning is usually the clearer choice if a breaking version is truly required.

### 26. Why allowlist sort fields instead of passing them directly to a database query?

**Answer:** A client-controlled sort field can cause invalid queries, expose internal columns, create expensive sorts, or become an injection risk in weak database code. Map a small allowed list such as createdAt, title, and author to known database expressions.

---

## E. Idempotency, concurrency, and caching

### 27. Design an idempotency-key flow for POST /payments.

**Answer:** The client sends a unique Idempotency-Key. The server scopes it to the authenticated user, stores a request fingerprint, processing state, and final response. If the same user retries with the same key and same fingerprint, return the saved response rather than create another payment. Do the lookup and creation safely so concurrent retries cannot both create a payment.

### 28. What if a key is reused with a different body?

**Answer:** Reject it, commonly with 409. A key represents one intended operation. Reusing it for a different amount or recipient is either a client bug or an ambiguous request. Returning the old response silently would make the bug hard to detect.

### 29. Why is exactly-once delivery difficult?

**Answer:** A process can complete work then crash before recording that completion or before sending an acknowledgement. A network response can be lost after successful processing. A sender retries because it cannot know what happened. Systems usually choose at-least-once delivery and make receivers idempotent rather than promising impossible exactly-once delivery across failures.

### 30. What is a lost update, and how do ETags help?

**Answer:** A lost update happens when two clients read the same old data, both modify it, and the later write silently overwrites the earlier one. The server gives a read response an ETag version. A client sends that version in If-Match when updating. If the version changed, the server rejects with 412 instead of silently accepting stale data.

### 31. Explain ETag, If-None-Match, and 304 as one flow.

**Answer:** The server returns a representation with an ETag. Later, the client sends If-None-Match containing its ETag. If the representation is unchanged, the server returns 304 Not Modified without the body, so the client reuses its cached copy. If it changed, the server returns a new body and new ETag.

### 32. Why can caching personalised data be a security bug?

**Answer:** A shared cache could serve one user’s profile, invoice, or permission-dependent result to another user if cache keys and directives are wrong. Private user-specific responses need careful Cache-Control rules, usually private or no-store depending on the data.

---

## F. Webhooks, GraphQL, and gRPC

### 33. Why are webhooks at-least-once by nature, and what must the receiver do?

**Answer:** The sender may complete delivery but not receive the receiver’s success response, so it retries. The receiver must deduplicate by an event ID, make side effects idempotent, and return success for already processed events. It must not send a second email or create a second database record for a duplicate event.

### 34. Explain webhook signature verification.

**Answer:** The sender computes a signature from the exact raw request bytes and a shared secret. The receiver computes its own signature from those same raw bytes and compares safely before trusting the event. Parsing and reserialising JSON can change byte formatting, making the signature comparison fail, so verification often must happen before normal JSON parsing.

### 35. What delivery policy should webhook documentation state?

**Answer:** State which status codes count as success, how long the sender waits before timeout, retry count and exponential-backoff schedule, whether ordering is guaranteed, the event ID used for deduplication, signature method, and how consumers can inspect or replay failed deliveries. Consumers need this to build correct receivers.

### 36. What problem does GraphQL solve, and what problems can it introduce?

**Answer:** GraphQL lets clients ask for exactly the fields and related data they need from one typed schema. It can reduce over-fetching and round trips. It can also introduce expensive deeply nested queries, N plus 1 database queries, authorization at many resolver layers, cache complexity, and query-cost abuse unless you add limits.

### 37. What is GraphQL N plus 1, and one solution?

**Answer:** N plus 1 happens when a query loads N parent records, then performs one extra database lookup for each parent’s relation. Loading 100 books and then 100 author queries is 101 queries. A batching and caching loader collects requested author IDs and fetches them in one query.

### 38. When is gRPC stronger than REST, and when is it weaker?

**Answer:** gRPC is strong for internal service-to-service communication needing strict typed contracts, generated clients, deadlines, streaming, and efficient binary messages. It is weaker for direct browser access, casual public API exploration, and simple HTTP caching because it needs more specialised tooling or a gateway.

---

## G. Interview scenarios

### 39. Design GET /orders for millions of orders.

**Answer:** Use explicit allowlisted filters such as status, customerId, and created date range. Use a fixed allowlisted sort, normally createdAt descending plus ID descending. Use cursor pagination with a bounded limit, for example default 20 and maximum 100. Return an object with items and nextCursor. Validate all inputs, require authentication and authorization, and ensure indexes support the allowed query patterns.

### 40. Product wants fullName renamed to name tomorrow. What do you ask?

**Answer:** Ask who consumes the field, whether mobile or external clients update slowly, whether generated SDKs or dashboards use it, and whether analytics or webhooks contain it. Renaming is breaking. Prefer adding name first, documenting deprecation of fullName, updating clients, measuring usage, then removing only after a communicated deadline or major API version.

### 41. A payment provider sends one webhook five times. How do you avoid five writes and emails?

**Answer:** Verify its signature, use the provider event ID as a unique deduplication key, and store it with a unique database constraint. Process the side effect only if the insert succeeds as new. If the same event arrives again, acknowledge it but skip the write and email. The unique constraint is important because two duplicate deliveries can race.

### 42. A frontend says GraphQL will make everything faster. How do you evaluate it?

**Answer:** Ask what is slow now: network round trips, payload size, database queries, rendering, or missing indexes. GraphQL can reduce over-fetching, but it can also create expensive queries and N plus 1 behaviour. Compare measured request patterns, caching needs, team tooling, authorization complexity, and whether a few well-designed REST endpoints solve the actual problem.

### 43. POST /exports takes 90 seconds. Design the contract.

**Answer:** Accept the request, create an export job, and return 202 with the job ID and status URL. Process the export asynchronously. GET /exports/job_1 returns queued, running, failed, or completed with a download URL when ready. Add authentication, expiry for downloads, idempotency if needed, and failure details safe for clients.

### 44. A user edits a profile in two tabs. How do you prevent overwrite?

**Answer:** Return an ETag or version when each tab reads the profile. Require If-Match or a version field on update. The first save advances the version. The second stale save fails with 412, after which the client fetches the latest profile and asks the user to resolve or retries a safe merge.

### 45. Customer reports duplicate webhooks. What do you inspect and explain?

**Answer:** Inspect delivery IDs, timestamps, response codes, timeout logs, retry attempts, and whether the receiver acknowledged quickly. Explain that the delivery contract is at least once, so duplicates are expected after uncertain delivery. The receiver must deduplicate by event ID; the sender provides logs and replay facilities to make this debuggable.

---

## H. Contract lifecycle and data shape

### 46. Why should write and read models differ?

**Answer:** Clients should only send fields they are allowed to control. A read model may include ID, createdAt, ownerId, computed availability, and audit data. A create body should not permit the client to set server-owned fields such as ownerId, payment status, price after a purchase, or createdAt. Separate models prevent mass-assignment bugs.

### 47. What do omitted field, null, empty array, and zero mean in PATCH?

**Answer:** The contract must define them explicitly. Omitted commonly means leave unchanged. Null may mean clear a nullable value. An empty array may mean replace the existing array with none. Zero is a real numeric value, not absence. Never infer these meanings from JavaScript truthiness.

### 48. Why are integer minor units or decimal strings safer than floating point for money?

**Answer:** JavaScript binary floating point cannot represent many decimal fractions exactly, so arithmetic can produce values like 0.30000000000000004. Integer paise or cents make addition exact within normal integer limits. Decimal strings can also preserve exact decimal representation when a decimal library handles calculations.

### 49. What does OpenAPI describe, and why do generated types not prove reality?

**Answer:** OpenAPI describes paths, methods, parameters, request bodies, response schemas, authentication, and examples. Generated types and docs only prove what the document says. The running server can still send the wrong field, wrong type, or wrong status. Contract tests and real integration tests verify behaviour.

### 50. What is a contract test?

**Answer:** A contract test checks that an implementation honours the agreed API shape. For example, a test can call GET /books/42 and assert a 200 response has a string ID, string title, and numeric availableCopies. If a server accidentally renames title to name, the test catches the breaking change.

### 51. Describe safe endpoint deprecation.

**Answer:** Announce the replacement and migration guide, add deprecation information in docs and possibly response headers, keep the old endpoint working for a defined period, measure usage, contact known consumers, and remove only after the deadline. For external clients, avoid surprise removal even when the replacement seems simple.

### 52. Design a rate-limit contract for an API key.

**Answer:** Define the identity being limited, such as API key, the window or token-bucket rate, and separate limits for expensive endpoints if needed. When exceeded, return 429 and include Retry-After when available. Document relevant remaining or reset headers if you provide them. Rate limiting protects capacity; it is not authorization because a valid but limited key is still allowed in principle, while authorization decides what it may access.

---

## Pass gate answers

You are ready for exercises when these ideas are clear:

- Idempotency exists because a network timeout does not tell a client whether a server action happened.
- 400 means malformed or untrusted request shape, 422 means understandable but unacceptable input, 409 means current-state conflict, and 500 means unexpected server failure.
- Path identifies a resource, query adjusts a read/list, headers carry metadata, and body carries created or changed data.
- Cursor pagination avoids the instability and deep-scan cost of offset pagination when ordering is stable.
- ETags compare the version a client read with current state before writing.
- Webhook consumers deduplicate because reliable delivery is normally at least once.

