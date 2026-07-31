# Week 2 Questions

Answer in your own words. If you use terms like "handshake," "multiplexing," "RTT," or "connection pool," explain the mechanism behind them.

---

## Section A: TCP/IP Model

### 1. What are the four layers of the TCP/IP model and what does each one do?

Answer:

Link layer — moves frames between devices on the same local network using MAC addresses. Internet layer (IP) — routes packets across networks using IP addresses; unreliable and connectionless. Transport layer (TCP/UDP) — adds ports for multiplexing and, with TCP, adds reliable ordered delivery. Application layer — your protocol (HTTP, DNS, WebSocket) that defines how applications communicate.

### 2. What is encapsulation?

Answer:

Encapsulation is each layer wrapping the data from the layer above with its own header. An HTTP response becomes the payload of a TCP segment, which becomes the payload of an IP packet, which becomes the payload of an Ethernet frame. At the receiving end, each layer strips its header and passes the payload upward (decapsulation).

### 3. What is a port and why do ports exist?

Answer:

A port is a 16-bit number (0-65535) that identifies a specific application or service on a machine. Ports exist because a single IP address serves many applications. When a TCP segment arrives, the OS uses the destination port number to deliver the data to the correct process. Well-known ports (80, 443, 5432) are conventions. Ephemeral ports (49152-65535) are assigned by the OS for client-side outgoing connections.

---

## Section B: TCP Deep Dive

### 4. Explain the TCP three-way handshake. Why can't it be done in two steps?

Answer:

Client sends SYN with its initial sequence number. Server responds with SYN-ACK (its own sequence number + acknowledgment of the client's). Client sends ACK confirming the server's sequence number. It requires three steps because both sides need to establish and confirm initial sequence numbers. Two steps would only confirm one direction — the server would start sending data without knowing the client received its sequence number, potentially sending data the client isn't ready to receive.

### 5. What are TCP sequence numbers and acknowledgments used for?

Answer:

Sequence numbers assign a number to every byte of data sent. Acknowledgments tell the sender which bytes have been received — specifically, the next expected byte. If the sender doesn't receive an ACK within a timeout, it retransmits the unacknowledged data. This is how TCP guarantees reliable, ordered delivery over an unreliable network.

### 6. What is the difference between TCP flow control and congestion control?

Answer:

Flow control protects the receiver — the receiver advertises a receive window telling the sender how much data it can accept. If the receiver is slow, the window shrinks. Congestion control protects the network — the sender maintains a congestion window that limits how much data can be in-flight. It starts small (slow start) and grows until packet loss is detected, then backs off. Flow control is receiver-driven; congestion control is sender-driven based on network feedback.

### 7. What is TCP slow start and why does it affect new connections?

Answer:

Slow start is TCP's mechanism for probing available bandwidth. A new connection starts with a small congestion window (typically ~14KB). For each acknowledged segment, the window doubles. This means a fresh connection can only send ~14KB initially — if your HTTP response is 100KB, it takes multiple round-trips to reach full throughput. This is one of the key reasons connection reuse (keep-alive, pooling) matters for performance.

### 8. What is TIME_WAIT and why can it cause problems?

Answer:

TIME_WAIT is a TCP state entered by the side that initiates connection close. It lasts for 2×MSL (typically 60 seconds). During this time, the source port + destination port combination cannot be reused. It exists to ensure stale packets from the old connection don't contaminate a new one using the same ports. It causes problems for high-throughput servers that open and close many short-lived connections — thousands of sockets stuck in TIME_WAIT can exhaust available ephemeral ports. Connection pooling avoids this.

### 9. What is TCP_NODELAY and when should you use it?

Answer:

TCP_NODELAY disables Nagle's algorithm, which normally batches small writes together before sending. With Nagle enabled, a 10-byte write might be held back, waiting for more data to fill a segment. For latency-sensitive applications (RPC calls, real-time services, financial trading), this delay is unacceptable. Setting TCP_NODELAY ensures every write is sent immediately. Most HTTP and gRPC libraries enable this by default.

### 10. What is TCP head-of-line blocking?

Answer:

In TCP, all data in a connection is a single ordered byte stream. If a packet is lost, the receiver cannot deliver subsequent packets to the application until the lost one is retransmitted, even if those subsequent packets arrived fine. This means one lost packet blocks all data behind it — head-of-line blocking. This is particularly problematic for HTTP/2, which multiplexes many independent streams over one TCP connection — a single lost packet blocks all streams.

---

## Section C: UDP

### 11. What does UDP provide and what doesn't it provide?

Answer:

UDP provides ports (multiplexing multiple applications on one IP) and checksums (detecting corrupted data). It does NOT provide connection establishment, reliable delivery, ordering, flow control, or congestion control. Each UDP datagram is independent — it may arrive out of order, be duplicated, or never arrive at all.

### 12. Name three use cases where UDP is preferred over TCP and explain why for each.

Answer:

DNS queries — small single request/response packets where retrying on loss is simpler than maintaining a TCP connection. Video/audio streaming — dropping a frame causes a brief glitch, but retransmitting causes a delay visible to the user; real-time trumps perfect delivery. Online gaming — stale game state is useless; it's better to process the latest position update than wait for a retransmitted old one.

---

## Section D: DNS

### 13. Walk through the full DNS resolution process for `api.example.com`.

Answer:

Application calls getaddrinfo. OS checks /etc/hosts, then its local cache. On cache miss, it queries the configured recursive resolver. The recursive resolver checks its cache. On miss, it asks a root nameserver "who handles .com?" — gets TLD nameserver addresses. Asks the .com TLD nameserver "who handles example.com?" — gets authoritative nameserver addresses. Asks the authoritative nameserver "what is the A record for api.example.com?" — gets the IP address with a TTL. Each level caches the result for the specified TTL. The IP is returned to the application.

### 14. What is TTL in DNS and what are the tradeoffs of short vs long TTLs?

Answer:

TTL (Time To Live) is how many seconds a DNS result can be cached before it must be re-queried. Short TTLs (30-300s) allow quick failover when IPs change but generate more DNS traffic. Long TTLs (3600-86400s) reduce DNS traffic and speed up resolution (more cache hits) but make changes slow to propagate — old IPs linger in caches worldwide.

### 15. Why is DNS resolution a potential bottleneck in Node.js?

Answer:

Node's default DNS resolution (`dns.lookup`) uses `getaddrinfo`, which is a blocking C library call. libuv runs it on the thread pool (default 4 threads). If your application makes many concurrent outgoing requests to different hostnames, DNS lookups compete for thread pool slots, causing unexpected latency even on fast networks. The alternative `dns.resolve` uses c-ares (non-blocking) but doesn't read /etc/hosts.

---

## Section E: HTTP

### 16. What is HTTP keep-alive and why was it important?

Answer:

In HTTP/1.0, every request required a new TCP connection — three-way handshake, slow start, TIME_WAIT on close. Keep-alive (default in HTTP/1.1) keeps the TCP connection open after a response, allowing subsequent requests to reuse it. This eliminates per-request handshake overhead, avoids slow start resets, and prevents port exhaustion from TIME_WAIT accumulation.

### 17. What is HTTP pipelining and why did it fail in practice?

Answer:

HTTP/1.1 pipelining allows sending multiple requests without waiting for each response. But responses must arrive in order. If the first response is slow, all subsequent responses are blocked — HTTP-level head-of-line blocking. Most browsers never enabled pipelining because of this and because many servers and proxies didn't handle it correctly. Instead, browsers opened 6 parallel TCP connections per domain as a workaround.

### 18. What is chunked transfer encoding and when is it used?

Answer:

Chunked transfer encoding allows the server to send a response without knowing the total size upfront. Each chunk is preceded by its size in hexadecimal, followed by the data. A zero-size chunk signals the end. It's used when streaming responses, generating content dynamically, or sending data as it's produced. In Node.js, calling `res.write()` multiple times before `res.end()` automatically uses chunked encoding.

### 19. How does HTTP/2 multiplexing solve HTTP/1.1's head-of-line blocking?

Answer:

HTTP/2 splits communication into binary frames, each tagged with a stream ID. Multiple request/response pairs (streams) share a single TCP connection, and their frames can be interleaved. If stream 1's response is slow, stream 3's frames can still be sent and received. This eliminates HTTP-level HOL blocking — no need for 6 parallel connections.

### 20. What is HPACK and why does it matter?

Answer:

HPACK is HTTP/2's header compression algorithm. HTTP headers are repetitive — Host, User-Agent, Cookie are sent with every request. HPACK uses a static table (61 common header pairs referenced by index), a dynamic table (headers from previous requests on the connection), and Huffman encoding. This reduces header overhead by 80-90%, which matters significantly for request-heavy applications with large cookies or many headers.

### 21. Why does HTTP/2 still suffer from head-of-line blocking?

Answer:

HTTP/2 solves HTTP-level HOL blocking (multiple streams aren't blocked by each other at the HTTP layer), but it runs on TCP. TCP sees all streams as one byte stream. If a single TCP packet is lost, TCP blocks all data until that packet is retransmitted — even data for other, unaffected streams. This is TCP-level HOL blocking, and it's the fundamental problem HTTP/3 (QUIC) solves.

### 22. How does HTTP/3 (QUIC) solve TCP's head-of-line blocking?

Answer:

QUIC implements its own reliability per stream on top of UDP. Each stream has independent sequence numbers and retransmission. If a packet belonging to stream 1 is lost, only stream 1 is blocked — streams 2 and 3 continue unaffected. QUIC also combines the transport and TLS handshakes into one step (1 RTT for new connections, 0 RTT for resumed), and supports connection migration when the client's IP changes.

---

## Section F: TLS

### 23. What three things does TLS provide?

Answer:

Confidentiality (data is encrypted — eavesdroppers see ciphertext), integrity (data cannot be tampered with in transit — any modification is detected), and authentication (the client verifies the server's identity through certificate chain validation, and optionally vice versa with mTLS).

### 24. Why does TLS 1.3 need fewer round-trips than TLS 1.2?

Answer:

TLS 1.2 requires 2 round-trips: one for the initial hello exchange and one for key exchange and cipher negotiation. TLS 1.3 combines key exchange into the ClientHello message (using key shares), so the entire handshake completes in 1 round-trip. For resumed connections, TLS 1.3 supports 0-RTT — the client can send encrypted data in its very first message.

### 25. What is mTLS and when would you use it?

Answer:

Mutual TLS (mTLS) is TLS where both sides present and verify certificates — not just the server proving its identity to the client, but the client also proving its identity to the server. Used for service-to-service authentication in microservices, zero-trust network architectures, and high-security API authentication. It's stronger than API keys because the private key never leaves the client, but more operationally complex (certificate distribution, rotation, revocation).

### 26. What is TLS termination and where does it typically happen?

Answer:

TLS termination is decrypting HTTPS traffic at a proxy or load balancer so the backend receives plain HTTP. The connection between client and load balancer is encrypted; the connection between load balancer and backend is not (or uses a separate internal TLS/mTLS). This simplifies backend code (no certificate management) and offloads CPU-intensive cryptographic operations to dedicated infrastructure.

---

## Section G: WebSockets, SSE, and Real-Time

### 27. How does a WebSocket connection start?

Answer:

It starts as a regular HTTP request with an `Upgrade: websocket` header. The server responds with `101 Switching Protocols`. After this handshake, the connection switches from HTTP to the WebSocket protocol — a persistent, bidirectional, full-duplex channel. Both sides can send messages at any time without waiting for a request.

### 28. When would you use SSE instead of WebSockets?

Answer:

When data flows only from server to client — live dashboards, notification streams, price feeds. SSE is simpler: it uses standard HTTP (works through proxies and CDNs), has automatic reconnection built into the browser API, and doesn't require a special protocol upgrade. WebSockets are necessary only when you need bidirectional communication (chat, collaborative editing, real-time games).

### 29. What is long polling and why is it inferior to WebSockets/SSE?

Answer:

Long polling: client sends a request, server holds it open until new data is available, sends the response, client immediately sends another request. It simulates push using repeated HTTP requests. It's inferior because each push requires a full HTTP request/response cycle (headers, cookies, etc.), idle connections consume server resources, and there's a gap between responses and the next request where updates can be missed or delayed.

---

## Section H: gRPC

### 30. What is gRPC and what problem does it solve?

Answer:

gRPC is an RPC framework that uses HTTP/2 for transport and Protocol Buffers for serialization. It solves the inefficiency of REST + JSON for internal service communication: protobuf is binary (3-10x smaller than JSON), parsing is faster, schemas are formally defined in .proto files, and HTTP/2 enables bidirectional streaming. It also generates strongly-typed client and server code from the schema.

### 31. What are the four gRPC streaming modes?

Answer:

Unary (one request, one response — like REST). Server streaming (one request, stream of responses — e.g., subscribing to updates). Client streaming (stream of requests, one response — e.g., uploading chunks). Bidirectional streaming (both sides send streams simultaneously — e.g., real-time collaboration).

### 32. When should you NOT use gRPC?

Answer:

Browser-facing APIs (browsers don't natively support gRPC — need gRPC-Web proxy), simple CRUD APIs where REST + JSON is perfectly adequate, when human readability is important (you can't curl a gRPC endpoint and read the response), and in environments where HTTP/2 support is limited.

---

## Section I: Connection Pooling

### 33. Why is opening a new connection for every database query expensive?

Answer:

Each new TCP connection requires a three-way handshake (1 RTT), potentially a TLS handshake (1-2 RTT), goes through TCP slow start (reduced initial throughput), consumes a file descriptor on each side, and consumes memory for buffers and state. At 1000 queries/second, that's 1000 handshakes per second plus 1000 sockets entering TIME_WAIT on close. Connection pooling eliminates all of this by reusing pre-established connections.

### 34. What happens when a connection pool is exhausted?

Answer:

When all connections in the pool are in use and a new request arrives, it waits in a queue. If it waits longer than the configured timeout, it fails with a pool exhaustion error. Common causes: pool max is too small, queries are too slow (holding connections too long), leaked connections (not returned to pool due to missing error handling), or N+1 queries using many connections per request.

### 35. What is a leaked connection in a pool?

Answer:

A leaked connection is one that was acquired from the pool but never returned — typically because an error occurred after acquiring the connection but the error handling code didn't release it. Over time, leaked connections accumulate until the pool is exhausted. This is why connection management must always use try/finally or equivalent patterns to ensure connections are returned regardless of errors.

---

## Section J: Predict the Behavior

### 36. Your API server makes HTTP requests to a third-party API. You don't configure a keep-alive agent. What network cost do you pay on every request?

Answer:

Every outgoing request opens a new TCP connection: three-way handshake (1 RTT), TLS handshake if HTTPS (1 RTT with TLS 1.3), then the HTTP request/response. After the response, the connection closes and enters TIME_WAIT (60 seconds of port unusability). Under high throughput, you'll exhaust ephemeral ports. With a keep-alive agent, subsequent requests to the same host reuse existing connections, eliminating handshake overhead.

### 37. Your server handles 10,000 concurrent WebSocket connections. A user reports that when user count exceeds ~1024, new connections fail. What's likely happening?

Answer:

The default file descriptor limit (`ulimit -n`) is likely 1024. Each WebSocket connection is a file descriptor. After 1024, the OS rejects new socket creation with EMFILE. The fix is increasing the FD limit with `ulimit -n 65535` or the equivalent system configuration.

### 38. Your database is in US-East and your server is in EU-West. RTT is 120ms. Each request makes 5 sequential database queries. What is the minimum latency added by the network?

Answer:

5 sequential queries × 120ms RTT = 600ms minimum network latency, plus the handshake cost if connections aren't pooled. With connection pooling, the handshake cost is paid once. But the 600ms sequential query cost remains. Solutions: reduce the number of queries (batch or join), move the database closer, or restructure to make queries parallel where possible.

---

## Section K: Production Diagnosis

### 39. Your service's p99 latency spikes to 5 seconds every few minutes, then returns to normal. Database query times are fine. What might cause this?

Answer:

Possible causes: (1) V8 garbage collection pauses — major GC on old generation can cause multi-second pauses; check with --trace-gc. (2) TLS certificate OCSP stapling timeouts — if the server checks certificate revocation status and the OCSP responder is slow. (3) DNS cache TTL expiration — cold DNS lookups hitting the thread pool. (4) Connection pool connections being recycled — if the pool closes idle connections and must re-establish them. (5) TCP connection resets causing reconnection bursts.

### 40. Your Node.js application makes many outgoing HTTP requests to various microservices. Under load, you see high latency even though the downstream services are fast. Thread pool usage is at 100%. What's happening?

Answer:

DNS lookups for the downstream service hostnames are saturating the libuv thread pool (default 4 threads). Each `dns.lookup()` is a blocking call that uses one thread pool slot. Under load with many different hostnames, all 4 threads are doing DNS resolution, and everything else that uses the thread pool (file I/O, crypto) queues up. Solutions: increase `UV_THREADPOOL_SIZE`, use `dns.resolve()` (non-blocking, uses c-ares), implement DNS caching, or reduce the number of unique hostnames being resolved.

---

## Pass Gate

You pass Week 2 only if:

- You can trace a complete request from DNS resolution through TCP handshake, TLS, HTTP, to response — naming every step.
- You can explain TCP's reliability guarantees and their performance costs.
- You can explain why HTTP/2 exists and what it improved over HTTP/1.1.
- You can explain why HTTP/3 exists and what TCP limitation it solves.
- You can explain TLS at the handshake level, not just "it encrypts things."
- You can compare WebSockets vs SSE vs long polling with specific tradeoffs.
- You can explain why connection pooling matters and what causes pool exhaustion.
- Your explanations reference specific mechanisms (sequence numbers, congestion windows, multiplexing, frames), not vague descriptions.
