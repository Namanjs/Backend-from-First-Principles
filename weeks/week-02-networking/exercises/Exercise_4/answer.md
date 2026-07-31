# Week 2 — Exercise 4: Connection Pooling Experiment

## Reflection Questions

---

**Q1. How much faster was the pooled version? Why?**

The pooled version was significantly faster. With unpooled connections, every single request pays the full TCP handshake cost (~70ms from exercise 1 timing data) plus any TLS overhead. Over 100 sequential requests that overhead compounds into a large total. With keep-alive pooling, the TCP connection is established once and reused for all subsequent requests — each request after the first skips the handshake entirely and goes straight to sending data. The savings per request are small but multiply across hundreds of requests into a meaningful difference.

---

**Q2. How many TCP connections were created in each scenario?**

In the unpooled version, 100 TCP connections were created — one per request, each with its own handshake and teardown overhead.

In the pooled version with sequential requests, only 1 TCP connection was created and reused for all 100 requests. With `maxSockets: 10`, up to 10 connections can be open simultaneously — but since requests were sequential (one at a time), a single socket handled all 100 requests one after another. The `maxSockets` limit matters when requests are concurrent, not sequential.

---

**Q3. What is TIME_WAIT? What did you see after the unpooled version?**

TIME_WAIT is a TCP state that a socket enters after a connection closes. The socket cannot be immediately reused — it sits in TIME_WAIT for a period (typically 60 seconds on Linux) to ensure any delayed packets from the old connection are safely discarded before the port is reused.

After running 100 unpooled requests, `ss -t state time-wait | wc -l` shows all those connections sitting in TIME_WAIT. Under heavy load this becomes a real problem — with thousands of short-lived connections per second, the available ephemeral port range (~28,000 ports on Linux by default) can be exhausted because ports are locked in TIME_WAIT and unavailable for new connections. Keep-alive avoids this entirely by not closing connections in the first place.

---

**Q4. How does this apply to database connections?**

Database connection pooling solves the exact same problem. Without pooling, every database query opens a new connection — paying the cost of a TCP handshake, TLS handshake, and database authentication handshake — then closes it when done. Under any real load this is a severe bottleneck.

With a connection pool, a fixed number of connections are opened at startup and kept alive. Each query borrows a connection from the pool, runs, and returns it. The handshake costs are paid once at startup, not on every query. This is why every production database client (pg, mongoose, Sequelize) uses a connection pool by default and why tuning pool size is an important production concern.