# Roadmap

## Timeline

- Pace: 10-15 hours/week
- Duration: 10 weeks (extendable if needed)
- Total effort: ~100-150 hours

## Philosophy

This curriculum is built on three beliefs:

1. Backend engineering is about understanding the machine, the network, and the data — not about knowing frameworks.
2. A developer who understands first principles can pick up any language or framework in two weeks.
3. The gap between junior and senior is not years of experience — it is depth of understanding.

## Week-by-Week Plan

### Week 1: How Computers Run Your Code

OS fundamentals. Processes, threads, memory, file descriptors, system calls. Blocking vs non-blocking I/O. Event loops from first principles — how they work in general, then how Node.js implements one with libuv and V8. Containers as process isolation.

Outcome: You can explain what happens from the moment your program starts to the moment a response leaves the process. You understand why Node.js is good at I/O and bad at CPU, from the OS level — not from a blog post.

### Week 2: Networking From First Principles

TCP/IP stack, DNS resolution, HTTP/1.1 → HTTP/2 → HTTP/3 evolution. TLS handshakes. WebSockets, Server-Sent Events, gRPC. Connection pooling. Everything that happens before your route handler runs.

Outcome: You can trace a request from `curl` to response, naming every network layer, handshake, and header involved.

### Week 3: API Design, Protocols, and Data Contracts

REST as an architectural style (not just CRUD). Richardson Maturity Model. Pagination at scale. Versioning strategies. Error design (RFC 7807). GraphQL deep dive. gRPC service definitions. Idempotency keys. Webhook design. Content negotiation.

Outcome: You can design a complete API for a complex system, justify every design decision, and anticipate edge cases before they become bugs.

### Week 4: Authentication, Authorization, and Security

Hashing vs encryption vs encoding. Password storage. Sessions vs tokens. JWT deep dive and pitfalls. OAuth 2.0 flows. OpenID Connect. RBAC vs ABAC. OWASP Top 10 for backend. Input validation. CORS. Secrets management.

Outcome: You can build a secure auth system and explain every security decision. You can identify common vulnerabilities in code review.

### Week 5: Databases — Relational Deep Dive

Relational model from Codd. ACID. Isolation levels and real anomalies. WAL. MVCC. B-tree and other index types. EXPLAIN ANALYZE. Query optimization. Connection pooling. Schema design and normalization. Migrations. Partitioning. Replication. Deadlocks. Vacuum and maintenance.

Outcome: You can design schemas, write optimized queries, read query plans, and explain how Postgres achieves durability and concurrency at the storage engine level.

### Week 6: Databases — NoSQL, Caching, and Data Access Patterns

Document model tradeoffs. MongoDB internals. Redis deep dive — data structures, persistence, eviction. Caching strategies: cache-aside, write-through, write-behind. Cache invalidation and stampede prevention. Elasticsearch and inverted indexes. N+1 problem. ORM tradeoffs. Repository pattern. CQRS. Polyglot persistence.

Outcome: You can choose the right database for each job, implement caching that doesn't break correctness, and design data access layers that separate persistence from domain logic.

### Week 7: Concurrency, Async Patterns, and Background Work

Concurrency vs parallelism from first principles. Race conditions and thread safety. Event loop deep dive. Worker threads. Message queues: RabbitMQ vs Kafka vs Redis Streams. Queue delivery semantics. Idempotency in depth. Retry strategies. Saga pattern. Outbox pattern. Circuit breakers. Bulkheads. Backpressure.

Outcome: You can move work off the request path reliably, handle failures gracefully, and explain distributed transaction patterns.

### Week 8: System Design and Architecture Patterns

Monolith vs microservices (honestly). Modular monolith. Service boundaries and DDD basics. API gateways. Load balancing. Reverse proxies. Horizontal vs vertical scaling. Stateless services. CAP theorem (what it actually says). Consistency models. Sharding. Event sourcing. CQRS + ES. Back-of-envelope estimation. Rate limiting at scale. CDNs. Real-time systems. Multi-tenancy.

Outcome: You can design systems on a whiteboard, estimate capacity, identify failure modes, and justify architectural decisions under interview pressure.

### Week 9: Observability, Testing, Reliability, and DevOps

Three pillars: logs, metrics, traces. Structured logging. OpenTelemetry. RED/USE methods. Health checks. Testing pyramid. Unit, integration, contract, load testing. SLIs/SLOs/SLAs. Error budgets. Graceful shutdown. Zero-downtime deployment. Feature flags. Docker deep dive. CI/CD pipeline design. Infrastructure as Code concepts. Kubernetes concepts.

Outcome: You can instrument, test, deploy, and operate a backend service with production-grade reliability practices.

### Week 10: Advanced Topics, Interview Mastery, and Capstone

Performance profiling. Memory leaks. Streams and backpressure. Serverless tradeoffs. GraphQL at scale. Database migrations at scale. Distributed consensus (Raft, Paxos conceptual). Probabilistic data structures. System design interview framework. Top 20 system design problems. Architecture critique. Capstone project completion.

Outcome: One polished multi-service project. One clean narrative for any backend interview. Confidence that comes from depth, not bluffing.

## Intentionally Excluded

- DSA (studied separately)
- Frontend frameworks
- Kubernetes operations
- Terraform/Pulumi hands-on
- Deep microservice orchestration tooling
- Language-specific runtime optimizations beyond Node.js

These can be added after Week 10 if needed.
