# Exercise 4: Reflection Answers

---

### Q1. Why did offset pagination show a duplicate after the insertion?

**Answer:**
Offset pagination works by skipping a fixed number of rows (`offset = 10`). 
When a new item is inserted at the top of the collection (newest first), every existing item gets pushed down by 1 index position. The item that was previously at index 9 (last item on Page 1) moves to index 10. When the client requests Page 2 with `offset = 10`, the server skips indices 0–9 and reads index 10 — returning the exact same item again.

---

### Q2. Why does cursor pagination avoid this problem?

**Answer:**
Cursor pagination does not rely on row indices or position offsets. Instead, it uses a fixed timestamp pointer (`cursor = createdAt`). 

When a new item is inserted at the top, Page 2 still asks for items created *before* the last seen timestamp (`createdAt < cursor`). Since newly inserted items have a newer timestamp than the cursor, they are ignored during the query for Page 2. The boundary point remains stable regardless of how many new items are added.

---

### Q3. If two books have the exact same `createdAt` timestamp, what would happen without the `id` tie-breaker in the cursor?

**Answer:**
Without a tie-breaker, filtering with `createdAt < cursor.createdAt` would skip **all** remaining books sharing that exact same timestamp. 
For example, if 5 books were created at `12:00:00.000Z` and Page 1 included 2 of them, asking for `createdAt < 12:00:00.000Z` for Page 2 would skip the remaining 3 books entirely. The `id` tie-breaker (`(createdAt, id) < (cursor.createdAt, cursor.id)`) provides a strictly deterministic unique ordering.

---

### Q4. Why should the cursor be opaque (base64-encoded) to the client?

**Answer:**
1. **Decoupling/Implementation Hiding:** If the client relies on parsing the cursor (e.g. assuming it's an integer ID or timestamp string), changing your internal database sorting or pagination implementation in the future will break client applications.
2. **Tamper Prevention:** Base64 encoding discourages clients from manually constructing or modifying cursors instead of passing back the exact `nextCursor` value produced by the server.

---

### Q5. Can the client jump to "page 5" with cursor pagination? Why is this a tradeoff?

**Answer:**
**No.** Cursor pagination requires reading pages sequentially because Page $N$ cannot be fetched without knowing the cursor from the end of Page $N-1$.

**The Tradeoff:**
- **Gain:** Complete stability against real-time insertions/deletions, and $O(1)$ database query performance (using index seeks `WHERE createdAt < cursor` instead of expensive $O(N)$ offsets `OFFSET 100000`).
- **Loss:** Loss of arbitrary deep page jumping (e.g. "jump directly to page 50").
