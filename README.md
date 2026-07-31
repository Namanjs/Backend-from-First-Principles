# Backend Mastery — First-Principles Curriculum

A 10-week backend engineering curriculum designed to take you from junior to senior-level depth. Every topic is taught from "why does this exist?" — not "how do I use this API?"

## Design Philosophy

- **Language-agnostic foundations** with TypeScript as the primary implementation language
- **First-principles teaching** — every concept starts from the problem it solves
- **Senior-level depth** — completing this should make you more prepared than most interviewers
- **No fluff** — every paragraph teaches something specific

## What This Covers

| Week | Topic |
|------|-------|
| 1 | OS Fundamentals: Processes, Memory, I/O, Event Loops |
| 2 | Networking: TCP/IP, DNS, HTTP/1-2-3, TLS, WebSockets, gRPC |
| 3 | API Design: REST, GraphQL, Versioning, Idempotency, Webhooks |
| 4 | Auth & Security: OAuth, JWT, RBAC/ABAC, OWASP, Secrets |
| 5 | Relational Databases: Postgres Internals, MVCC, Indexing, Query Plans |
| 6 | NoSQL & Caching: MongoDB, Redis Deep Dive, Elasticsearch, Cache Patterns |
| 7 | Concurrency & Queues: Message Brokers, Sagas, Retry, Circuit Breakers |
| 8 | System Design: CAP, Sharding, Event Sourcing, Estimation |
| 9 | Observability, Testing, CI/CD, Docker, Kubernetes Concepts |
| 10 | Advanced Topics, Interview Mastery, Capstone |

## What This Does Not Cover

- DSA (studied separately)
- Frontend frameworks
- Kubernetes operations (concepts only)
- Terraform/Pulumi operations (concepts only)

## Folder Layout

- `curriculum/` — roadmap and operating rules
- `weeks/` — one folder per week, each with notes, questions, exercises, review
- `drills/` — system design, debugging, and interview drill banks
- `capstone/` — the multi-service project that ties everything together
- `progress.md` — single source of truth for completion status

## Operating Model

Each week produces four outputs:

- `notes.md` — exhaustive first-principles teaching material (2000-4000 lines)
- `questions.md` — 30-50 viva questions with mechanism-level model answers
- `exercises.md` — 5-8 coding exercises with clear specs
- `review.md` — self-assessment against pass gate criteria

You pass a week only when you can explain every concept from mechanism, not from memory.

## Pace

- Target: 10-15 hours/week
- Duration: 10 weeks (~100-150 total hours)
- Each week is self-contained and can be studied faster with more time
