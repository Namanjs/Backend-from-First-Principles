# Exercise 3: Reflection Answers

---

### Q1. Why is `POST /books/:id/borrows` better than `PATCH /books/:id {"action": "borrow", "memberId": "..."}` for this operation?

**Answer:**
`POST /books/:id/borrows` treats borrowing as the **creation of a new sub-resource** (`borrow` record).

1. **Clear REST Semantics:** `POST` is standard for creating resources. Using `PATCH` with custom `"action"` strings turns REST into RPC (Remote Procedure Call) and hides business operations behind generic update routes.
2. **Auditability:** Creating a `borrow` record produces an explicit audit trail (who borrowed it, when, when it's due) instead of mutating the `book` object in-place and destroying state history.

---

### Q2. You chose status 404 for "member does not exist." Defend your choice. What is the argument for status 422?

**Answer:**
- **Argument for 404 (Not Found):** The client referenced a specific entity ID (`member_99`) in the database. Since that member resource does not exist in the system, `404 Not Found` accurately reflects a missing dependency.
- **Argument for 422 (Unprocessable Entity):** The request syntax and JSON formatting are valid, but the request payload is logically unprocessable by business logic because the referenced `memberId` fails domain referential integrity checks.

---

### Q3. In a real system with a database, two borrow requests could arrive simultaneously when `availableCopies` is 1. Both check availability, both see 1, both proceed. How would you prevent this?

**Answer:**
This is a classic **race condition** (check-then-act bug). In a database, it is prevented using one of two strategies:

1. **Atomic Conditional Update:**
   ```sql
   UPDATE books SET available_copies = available_copies - 1 
   WHERE id = '101' AND available_copies > 0;
   ```
   If 0 rows are updated, the database transaction fails and returns a state conflict.
2. **Pessimistic Locking (`SELECT ... FOR UPDATE`):**
   Locks the `books` row during the database transaction so the second request must wait until the first transaction commits and updates the copy count.

---

### Q4. Is this borrow operation idempotent? If the client retries after a timeout, could it create two borrow records? What would fix that?

**Answer:**
**No, `POST` is not idempotent by default.**
If the server processes the borrow request, decrements the copy, and creates the borrow record — but the network drops the HTTP response — the client will experience a timeout and retry `POST /books/101/borrows`.

The retry will create a **second** borrow record and decrement `availableCopies` again!

**Fix:** Require an `Idempotency-Key` header on `POST /books/:bookId/borrows` (which we will build in Exercise 5). The server stores the key and returns the cached borrow response on retries instead of re-executing the borrow logic.