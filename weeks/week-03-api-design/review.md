# Week 3 Review: API Design, Protocols, and Data Contracts

Status: not started

Complete this after the theory questions and exercises. Be specific: write the route, test result, or explanation that supports each judgment. “I understand it” is not evidence.

## Concept Review

- API contract vs route implementation:
- Resource vs representation:
- REST constraints and limits:
- Path vs query vs headers vs body:
- Read model vs write model:
- `null` vs omitted vs empty vs zero semantics:
- Public IDs, timestamps, money, and enum evolution:
- Safe methods:
- Idempotent methods:
- POST vs PUT vs PATCH:
- Status codes (400/401/403/404/409/412/415/422/429):
- RFC 9457-style error responses:
- Runtime validation vs TypeScript types:
- Filtering and sort allowlists:
- Offset pagination tradeoffs:
- Cursor pagination and deterministic order:
- Backward-compatible vs breaking changes:
- API versioning strategy:
- Deprecation and migration process:
- OpenAPI and contract testing:
- Idempotency keys:
- Exactly-once vs at-least-once reasoning:
- ETags / If-Match and lost updates:
- Content negotiation and caching:
- Rate-limit contract and 429 behavior:
- Webhook signing, retries, and deduplication:
- REST vs GraphQL vs gRPC tradeoffs:

## Practical Review

- Orders API contract is explicit enough to implement independently:
- Validation errors use stable machine-readable fields:
- Malformed JSON, invalid domain input, and state conflicts are distinguished:
- Cursor pagination survives an insertion between pages:
- ETag demonstration rejects a stale update:
- Idempotency-key demonstration creates only one payment intent after retry:
- Webhook consumer verifies raw-body signature:
- Webhook consumer deduplicates an event:
- REST/GraphQL/gRPC decision memos identify real tradeoffs:
- OpenAPI document and runtime behavior are checked together:
- Data-shape edge cases (`null`, omission, empty, zero) are tested:
- Tests or reproducible request commands recorded:
- Explanation quality is mechanism-level, not pattern-name-level:

## Mistakes Found

Record each one in this form:

1. **Symptom:**
2. **Root cause:**
3. **Why my earlier reasoning was wrong:**
4. **Correct rule / mental model:**
5. **How I verified the correction:**

## Oral Checkpoint

Answer these cold, without notes:

1. A client timed out during `POST /payments`. Why can it not safely decide to retry from the timeout alone, and how does an idempotency key change the contract?
2. Why can an API return a different response to the second DELETE and still call DELETE idempotent?
3. Design a cursor for orders sorted by newest first. Why is `createdAt` alone insufficient?
4. A webhook sender sees a timeout. Why must it retry, and why must the receiver deduplicate?
5. A user saves a profile from two browser tabs. Trace the ETag/If-Match flow that prevents silent data loss.
6. When would GraphQL make a product worse than a REST API?

## Decision

- Pass:
- Repeat:
- Topics that need a live explanation review:
- Code patterns that need muscle-memory repetition:

## Notes

- Fill after self-review or live review.
