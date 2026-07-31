# Week 2 Review

Status: reviewed

## Review Template

### Concept Review

- TCP/IP model (layers, encapsulation): **strong** — encapsulation described precisely at the byte level, not abstractly
- TCP deep dive (handshake, seq/ack, flow control, congestion control): **strong** — three-way handshake mechanism, why two steps fail, and the distinction between receiver-driven flow control vs sender-driven congestion control all answered correctly
- TCP issues (HOL blocking, TIME_WAIT, Nagle): **solid** — TIME_WAIT explained correctly in Exercise 4; port exhaustion risk identified
- UDP (when and why): covered in notes
- DNS resolution chain: **strong** — full resolution trace documented in Exercise 6 (local resolver → root → TLD → authoritative), thread pool implication of `dns.lookup()` vs `dns.resolve4()` understood
- DNS in Node.js (thread pool issue): **strong** — Exercise 6 (server2.js) directly demonstrates `dns.lookup()` saturating the thread pool and delaying `fs.readFile()`
- HTTP/1.1 (keep-alive, pipelining, chunked encoding): **strong** — Exercise 3 implements chunked transfer from scratch; Exercise 4 benchmarks keep-alive vs non-pooled and explains TIME_WAIT
- HTTP/2 (multiplexing, HPACK, binary framing): covered in notes; Exercise 1 curl trace confirmed HTTP/2 negotiation via ALPN
- HTTP/3 and QUIC (UDP-based, per-stream reliability, 0-RTT): covered in notes
- TLS (handshake, certificate chains, mTLS, TLS termination): **strong** — Exercise 1 shows live TLS 1.3 handshake data; Exercise 7 covers certificate chain rationale, SNI, expiry, and termination at load balancer
- WebSockets vs SSE vs long polling: **solid** — Exercise 5 implements a working WebSocket chat server with broadcast and stats endpoint
- gRPC (protobuf, streaming modes, when to use): covered in notes
- Connection pooling (why, how, exhaustion): **strong** — Exercise 4 benchmarks 100 sequential requests pooled vs unpooled, explains TIME_WAIT and database pooling analogy

### Practical Review

- Request trace with curl -v: **pass** — full timing breakdown documented; DNS/TCP/TLS overhead correctly quantified as ~64% of total request time
- TCP server with protocol parsing: **pass** — Exercise 2 implements connection tracking, per-connection stats, idle timeout, ECHO/TIME/STATS/CONNS/QUIT commands; correctly addresses TCP framing boundary problem
- Raw HTTP server (no Express): **pass** — Exercise 3 builds routing, body parsing, chunked streaming, CORS from scratch using only `http` module
- Connection pooling experiment: **pass** — Exercise 4 demonstrates measurable difference between pooled and unpooled; TIME_WAIT observed with `ss`
- WebSocket chat server: **pass** — Exercise 5 broadcasts join/message/disconnect events; HTTP stats endpoint coexists on same server
- DNS investigation: **pass** — Exercise 6 benchmarks `dns.lookup()` vs `dns.resolve4()`; Exercise 6 (server2.js) proves thread pool contention; full `dig +trace` resolution chain documented
- TLS certificate inspection: **pass** — Exercise 7 documents GitHub certificate (wildcard, Sectigo CA, ECDSA, P-256); conceptual questions answered at mechanism level
- httpClient project: **pass** — reusable HTTP client with keep-alive agent, timeout, retry on error, GET/POST/PUT/DELETE methods
- Explanation quality (mechanism-level): **strong** — answers explain the OS-level or protocol-level reason, not just the observable behavior

### Mistakes Found

1. **Exercise 2 — brace alignment bug in `close` handler:**
   ```javascript
   if (conn)
       conn.active = false;
   
       console.log(...)  // ← this always runs, not guarded by the if
   ```
   The `console.log` is indented as if it's inside the `if` block but it isn't — JavaScript doesn't use indentation for scope. Use braces:
   ```javascript
   if (conn) {
       conn.active = false;
   }
   console.log(...);
   ```

2. **Exercise 6 — `url.parse()` is deprecated:**
   `url.parse(req.url)` in Exercise 5's server.js uses a deprecated API. Prefer `new URL(req.url, 'http://localhost')` which is the current standard and returns the same `pathname`.

### Decision

- Pass: **yes**
- Repeat: no

### Notes

- Week 2 is complete across all 7 exercises. The work demonstrates genuine understanding of networking internals, not surface-level API usage.
- The `httpClient.js` project in `/project` is a solid production-style artifact — keep-alive, timeout, retry logic, all correct.
- The DNS thread pool experiment (server2.js) was a particularly strong exercise — directly observing `fs.readFile()` getting delayed because `dns.lookup()` ate the thread pool is the kind of thing most developers never see.
- No exercises skipped.
