# Exercise 2: Reflection Answers

---

### Q1. What specific damage could the mass assignment attack cause in a real system with a database?

**Answer:**
In an ORM/database setting (like Prisma, Sequelize, or Mongoose), spreading `req.body` directly into a database query (e.g. `User.create(req.body)`) allows attackers to overwrite internal database columns. An attacker could set `"role": "admin"`, `"emailVerified": true`, `"balance": 999999`, or overwrite foreign keys (`"orgId": "other_company"`), leading to privilege escalation, data corruption, and unauthorized tenant access.

---

### Q2. Why must validation use a whitelist approach (pick only known fields) rather than a blacklist approach (reject known bad fields)?

**Answer:**
A blacklist approach requires developers to anticipate every dangerous field name (e.g., blocking `isAdmin`, `role`, `id`). Developers will inevitably forget internal fields or new fields added in future schema migrations.

A **whitelist approach** explicitly selects only expected fields (`title` and `author`) and discards everything else. Any unallowed property sent by an attacker is silently ignored, failing closed by default.

---

### Q3. Where in the request lifecycle should body size limiting happen? Before or after JSON parsing? Why?

**Answer:**
Body size limiting **must happen BEFORE JSON parsing** (at the stream/raw byte level).

If size limiting happened *after* parsing, an attacker could send a 200MB JSON payload. The server would allocate memory, consume CPU parsing the huge string, and exhaust system resources (Denial of Service) *before* rejecting it. Stream-level limiting (e.g., `express.json({ limit: '10kb' })`) aborts the HTTP connection as soon as incoming bytes exceed 10KB without parsing.

---

### Q4. A colleague says "we use TypeScript, so the types guarantee the body is correct." Explain why they are wrong.

**Answer:**
TypeScript types exist **only at compile time** and are completely erased during compilation into JavaScript. At runtime, HTTP requests are raw, untrusted JSON strings sent over the wire by external clients. TypeScript cannot inspect, cast, or enforce types on incoming network data. Relying on TypeScript types for runtime request bodies creates a false sense of security while leaving the API completely vulnerable to malformed or malicious payloads.