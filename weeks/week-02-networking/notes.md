# Week 2: Networking From First Principles

## Goal

Understand everything that happens on the network between a client sending a request and your code receiving it. By the end of this week, you should be able to explain:

- what the TCP/IP model is and what each layer does
- how TCP establishes connections, guarantees delivery, and manages congestion
- when and why UDP is used instead of TCP
- how DNS resolves a hostname to an IP address, step by step
- how HTTP/1.1 works, including keep-alive, pipelining, and head-of-line blocking
- what HTTP/2 changed and why (multiplexing, streams, HPACK)
- what HTTP/3 and QUIC are solving
- how TLS works — the handshake, certificate chains, and why TLS 1.3 is faster
- how WebSockets work and when to use them vs SSE vs polling
- what gRPC is and why it exists
- why connection pooling matters for backend performance

When someone asks "what happens when you type a URL in a browser," you should be able to answer at a level that would satisfy a network engineer.

---

## Part 1: The TCP/IP Model — What Each Layer Does

The internet is built in layers. Each layer has a specific job and communicates only with the layer above and below it.

### Why layers exist

Layers exist so that each concern is handled independently. The application (your Express server) does not need to know how to route packets across the internet. The network does not need to know whether the data is HTTP or SMTP. Each layer does its job and passes data to the next.

### The four layers

```
┌──────────────────────────────┐
│   Application Layer          │  HTTP, DNS, SMTP, WebSocket, gRPC
├──────────────────────────────┤
│   Transport Layer            │  TCP, UDP
├──────────────────────────────┤
│   Internet (Network) Layer   │  IP, ICMP, ARP
├──────────────────────────────┤
│   Link (Network Access) Layer│  Ethernet, Wi-Fi, physical hardware
└──────────────────────────────┘
```

### What each layer does

**Link layer**: Gets frames from one device to the next device on the same local network. Uses MAC addresses. This is Ethernet, Wi-Fi, the physical cables and switches.

**Internet layer (IP)**: Gets packets from one machine to another across networks. Uses IP addresses. This is where routing happens — each router looks at the destination IP and decides where to forward the packet. IP is **unreliable** and **connectionless**: packets can arrive out of order, get duplicated, or get lost. IP doesn't care.

**Transport layer (TCP/UDP)**: Adds the concept of ports (so multiple applications can share one IP address) and, in TCP's case, adds reliability — guaranteed delivery, ordering, and flow control.

**Application layer**: Your protocol — HTTP, DNS, SMTP, WebSocket. This is where your backend code operates.

### How data flows through the layers

When your server sends an HTTP response:

```
Application:  HTTP response (headers + body)
     ↓ wrapped in
Transport:    TCP segment (source port, dest port, sequence number, data)
     ↓ wrapped in
Internet:     IP packet (source IP, dest IP, TTL, TCP segment)
     ↓ wrapped in
Link:         Ethernet frame (source MAC, dest MAC, IP packet)
     ↓
Physical wire/radio → switches → routers → ... → destination
```

Each layer adds its own header. This is called **encapsulation**. At the receiving end, each layer strips its header and passes the payload up. This is **decapsulation**.

### Ports

A port is a 16-bit number (0-65535) that identifies a specific application or service on a machine. When your server listens on port 3000, the OS directs all TCP segments with destination port 3000 to your process.

Well-known ports:
- 80: HTTP
- 443: HTTPS
- 22: SSH
- 53: DNS
- 5432: PostgreSQL
- 6379: Redis
- 27017: MongoDB

Ephemeral ports (49152-65535): used by clients for outgoing connections. When your browser connects to a server, the OS assigns a random ephemeral port as the source port.

---

## Part 2: TCP — The Reliable Transport

TCP (Transmission Control Protocol) provides reliable, ordered, error-checked delivery of data between applications. It is the foundation of HTTP, and therefore the foundation of almost every backend API.

### The three-way handshake

Before any data is sent, TCP establishes a connection:

```
Client                          Server
  |                                |
  |  ──── SYN (seq=100) ────>     |   1. Client sends SYN
  |                                |
  |  <── SYN-ACK (seq=300,        |   2. Server responds with SYN-ACK
  |      ack=101) ──               |
  |                                |
  |  ──── ACK (ack=301) ────>     |   3. Client sends ACK
  |                                |
  |      Connection established    |
```

**SYN**: "I want to connect. My starting sequence number is 100."
**SYN-ACK**: "I accept. My starting sequence number is 300. I acknowledge your 100 (expecting 101 next)."
**ACK**: "I acknowledge your 300 (expecting 301 next)."

Why this matters for backend performance: the three-way handshake adds one full round-trip before any data can be sent. If the round-trip time (RTT) between client and server is 50ms, every new TCP connection has a minimum 50ms overhead before the first byte of HTTP data. This is why connection reuse (keep-alive, connection pooling) is so important.

### Sequence numbers and acknowledgments

TCP assigns a sequence number to every byte of data sent. The receiver acknowledges received data by sending back the next expected sequence number.

```
Client sends: [seq=1000, 500 bytes of data]
Server responds: [ack=1500]  // "I got everything up to byte 1500, send from there"

Client sends: [seq=1500, 300 bytes of data]
Server responds: [ack=1800]
```

If the server doesn't receive an acknowledgment within a timeout, it retransmits the data. This is how TCP guarantees delivery — if a packet is lost, it gets sent again.

### Flow control — receive window

The receiver tells the sender how much data it can accept (the **receive window**). This prevents a fast sender from overwhelming a slow receiver.

```
Server to client: "My receive window is 65535 bytes"
// Client will not send more than 65535 bytes without getting an ACK
```

If the receiver is processing data slowly (your backend is slow), the receive window shrinks. If it shrinks to zero, the sender stops completely. This is **TCP flow control** — the receiver controls the rate.

### Congestion control — slow start and AIMD

Flow control protects the receiver. Congestion control protects the network.

TCP starts with a small **congestion window** (cwnd) — typically 10 segments (~14KB). The sender cannot have more than cwnd bytes in-flight at once.

**Slow start**: For each ACK received, cwnd doubles. 14KB → 28KB → 56KB → 112KB. This exponential growth quickly ramps up to the available bandwidth.

**Congestion avoidance (AIMD)**: Once cwnd reaches a threshold (ssthresh), growth becomes linear — add 1 segment per RTT. If packet loss is detected, cwnd is cut in half (Multiplicative Decrease), then grows linearly again (Additive Increase).

Why this matters for backends:

1. **New connections start slow.** A fresh TCP connection can only send ~14KB initially. If your HTTP response is 100KB, it takes multiple round-trips to reach full speed. This is another reason connection reuse matters.

2. **Latency spikes cause throughput drops.** Packet loss triggers congestion window halving. On lossy networks (mobile, satellite), TCP throughput suffers significantly. This is one motivation for QUIC/HTTP/3.

### Connection teardown — the four-way handshake

Closing a TCP connection:

```
Client                          Server
  |  ──── FIN ────>               |   1. Client says "I'm done sending"
  |  <── ACK ──                   |   2. Server acknowledges
  |  <── FIN ──                   |   3. Server says "I'm done sending too"
  |  ──── ACK ────>               |   4. Client acknowledges
```

### TIME_WAIT state

After the final ACK, the side that initiated the close enters **TIME_WAIT** for 2×MSL (Maximum Segment Lifetime, typically 60 seconds). During this time, the socket cannot be reused.

Why TIME_WAIT exists: to ensure any delayed packets from the old connection are discarded before a new connection uses the same port pair. Without it, a new connection could receive stale data from an old one.

Why it matters for backends: if your server opens and closes many short-lived connections (e.g., to a database without connection pooling), you can exhaust available ports because thousands of sockets are stuck in TIME_WAIT. This is another reason connection pooling exists.

### TCP Nagle's algorithm and TCP_NODELAY

Nagle's algorithm batches small writes together to reduce the number of small packets on the network. If you send 10 bytes, Nagle may wait for more data before actually sending.

For interactive or latency-sensitive applications (real-time games, financial trading, RPC calls), this delay is unacceptable. Setting `TCP_NODELAY` disables Nagle's algorithm — every write is sent immediately.

In Node.js: `socket.setNoDelay(true)`.

Many HTTP libraries set this by default. gRPC sets it by default. If you're building a low-latency service, know that this option exists.

---

## Part 3: UDP — When TCP Is Too Much

UDP (User Datagram Protocol) is the other major transport protocol. It provides:

- Ports (multiplexing)
- Checksums (error detection)

That's it. No connections, no reliability, no ordering, no flow control, no congestion control.

### When UDP is used

| Use case | Why UDP |
|----------|---------|
| DNS queries | Small request/response. Retrying a lost query is cheaper than maintaining a TCP connection. |
| Video/audio streaming | A dropped frame is better than waiting for retransmission. Real-time matters more than perfect delivery. |
| Online gaming | Stale game state is useless. It's better to drop old packets than delay new ones. |
| QUIC (HTTP/3) | Builds its own reliability on top of UDP to avoid TCP's head-of-line blocking. |
| Health checks, heartbeats | Simple, low-overhead pings where occasional loss is acceptable. |

### Why not use UDP for everything?

Because you'd have to rebuild reliability yourself. TCP's congestion control also prevents UDP-heavy applications from overwhelming the network. Applications using UDP at scale (like QUIC) must implement their own congestion control.

---

## Part 4: DNS — How Hostnames Become IP Addresses

Before your browser can connect to `api.example.com`, it needs to know the IP address. DNS (Domain Name System) is the distributed database that maps hostnames to IP addresses.

### The resolution chain

When your application resolves `api.example.com`:

```
1. Application calls getaddrinfo("api.example.com")

2. OS checks /etc/hosts file — is there a hardcoded entry? If yes, use it.

3. OS checks its local DNS cache — was this recently resolved? If yes, use cached result.

4. OS sends a query to the configured recursive resolver
   (usually your ISP's DNS server, or 8.8.8.8, or 1.1.1.1)

5. Recursive resolver checks its cache. If no cached result:

6. Recursive resolver asks a root nameserver:
   "Who handles .com?"
   Root says: "Try these .com TLD nameservers"

7. Recursive resolver asks .com TLD nameserver:
   "Who handles example.com?"
   TLD says: "Try these authoritative nameservers for example.com"

8. Recursive resolver asks example.com's authoritative nameserver:
   "What is the IP of api.example.com?"
   Authoritative says: "93.184.216.34, TTL 3600"

9. Recursive resolver caches the result (for TTL seconds) and returns it.

10. OS caches the result and returns it to the application.

11. Application now has the IP address and can open a TCP connection.
```

### Record types

| Record | Purpose | Example |
|--------|---------|---------|
| A | Maps hostname to IPv4 address | `api.example.com → 93.184.216.34` |
| AAAA | Maps hostname to IPv6 address | `api.example.com → 2606:2800:220:1:...` |
| CNAME | Alias to another hostname | `www.example.com → example.com` |
| MX | Mail server for a domain | `example.com → mail.example.com` |
| TXT | Arbitrary text (SPF, DKIM, verification) | `example.com → "v=spf1 ..."` |
| NS | Authoritative nameservers for a domain | `example.com → ns1.example.com` |
| SRV | Service location (host + port) | Used by some service discovery systems |

### TTL (Time To Live)

Every DNS record has a TTL — how many seconds the result can be cached. After the TTL expires, resolvers must query again.

Short TTLs (30-300 seconds): allow quick failover (change the IP and clients pick it up quickly). More DNS traffic.

Long TTLs (3600-86400 seconds): reduce DNS traffic but make changes propagate slowly.

### DNS in Node.js — the thread pool gotcha

When you call `dns.lookup()` (which Node uses by default for HTTP requests), it calls the C library function `getaddrinfo()`, which is a **blocking** system call. libuv runs it on the thread pool.

If your application makes many concurrent outgoing HTTP requests to different hostnames, DNS lookups can saturate the thread pool (default 4 threads), causing unexpected latency even though the network is fast.

Alternative: `dns.resolve()` uses c-ares (a non-blocking DNS library) and does not use the thread pool. However, it doesn't read `/etc/hosts` or use the OS resolver configuration.

### Production reality

1. **DNS propagation delays**: When you change a DNS record, cached copies with the old TTL linger. "DNS propagation" is just caches expiring at different times worldwide.

2. **DNS-based load balancing**: Multiple A records for the same hostname. The resolver returns different IPs, distributing traffic. Simple but limited (no health checking, coarse-grained).

3. **DNS failures**: If your DNS resolver is down, your application cannot resolve hostnames. This is why `/etc/resolv.conf` often lists multiple nameservers.

4. **Internal DNS**: In Kubernetes, pods discover services via cluster DNS (e.g., `my-service.my-namespace.svc.cluster.local`). Understanding DNS is essential for service-to-service communication.

---

## Part 5: HTTP/1.1 — The Protocol That Built The Web

HTTP (Hypertext Transfer Protocol) is an application-layer protocol for client-server communication. It runs on top of TCP.

### Request format

```http
GET /api/users?limit=10 HTTP/1.1
Host: api.example.com
Accept: application/json
Authorization: Bearer eyJhbGciOi...
Connection: keep-alive
```

**Request line**: method, path (with query string), HTTP version.
**Headers**: key-value pairs providing metadata.
**Empty line**: separates headers from body.
**Body**: optional, used for POST/PUT/PATCH.

### Response format

```http
HTTP/1.1 200 OK
Content-Type: application/json
Content-Length: 128
Cache-Control: max-age=60
X-Request-Id: abc-123

{"users": [{"id": 1, "name": "Naman"}]}
```

**Status line**: HTTP version, status code, reason phrase.
**Headers**: metadata about the response.
**Body**: the actual response data.

### Keep-alive

In HTTP/1.0, every request required a new TCP connection. Send request → get response → close connection. The three-way handshake overhead was paid for every single request.

HTTP/1.1 introduced **persistent connections** (keep-alive) by default. After the response, the TCP connection stays open for subsequent requests. Multiple requests can be sent over the same connection sequentially.

```
Without keep-alive:                  With keep-alive:
TCP handshake                        TCP handshake
Request 1 → Response 1              Request 1 → Response 1
TCP close                            Request 2 → Response 2
TCP handshake                        Request 3 → Response 3
Request 2 → Response 2              ...
TCP close                            TCP close (after idle timeout)
TCP handshake
Request 3 → Response 3
TCP close
```

The savings are significant: no handshake overhead, no slow start reset, no TIME_WAIT port exhaustion.

### Pipelining (and why it failed)

HTTP/1.1 also defined **pipelining**: send multiple requests without waiting for each response. But responses must arrive in the same order as requests.

```
Client sends:   Request 1, Request 2, Request 3
Server must respond: Response 1, then Response 2, then Response 3
```

If Response 1 takes a long time, Responses 2 and 3 are blocked behind it — even if they're ready. This is **head-of-line (HOL) blocking**.

Because of HOL blocking, most browsers never implemented pipelining. Instead, they open 6 parallel TCP connections per domain — a workaround, not a solution.

### Chunked transfer encoding

When the server doesn't know the total response size upfront (e.g., streaming data), it uses **chunked transfer encoding**:

```http
HTTP/1.1 200 OK
Transfer-Encoding: chunked

1a
This is the first chunk.

1c
This is the second chunk.

0

```

Each chunk has its size in hexadecimal, followed by the data. A chunk of size 0 marks the end. This allows streaming responses without knowing the total size.

In Node.js, when you use `res.write()` multiple times before `res.end()`, Express/Node automatically uses chunked encoding.

### Content-Length vs Transfer-Encoding

**Content-Length**: "The body is exactly N bytes." The receiver knows when the body ends by counting bytes. Cannot be used if the total size is unknown upfront.

**Transfer-Encoding: chunked**: "I'll send the body in chunks and tell you the size of each chunk. A zero-size chunk means I'm done." Used when the total size is unknown.

These are mutually exclusive. If both are present, Transfer-Encoding takes priority.

---

## Part 6: HTTP/2 — Fixing HTTP/1.1's Limitations

HTTP/2 (standardized in 2015) addressed the fundamental limitations of HTTP/1.1, particularly head-of-line blocking.

### Binary framing

HTTP/1.1 is text-based. HTTP/2 is binary. All communication is split into small messages called **frames**, each belonging to a **stream**.

```
HTTP/1.1:  GET /users HTTP/1.1\r\nHost: api.example.com\r\n\r\n  (text)
HTTP/2:    [HEADERS frame, stream 1] [DATA frame, stream 1]   (binary)
```

Binary is more efficient to parse, more compact, and less error-prone than text parsing.

### Multiplexing — the key improvement

Multiple requests and responses can be interleaved on a single TCP connection simultaneously. Each request/response pair is a **stream** with a unique ID. Frames from different streams can be mixed:

```
Single TCP connection:
  [HEADERS stream 1] [HEADERS stream 3] [DATA stream 1] [DATA stream 3] [DATA stream 1]
```

This eliminates HTTP-level head-of-line blocking. If stream 1's response is slow, stream 3's frames can still be sent and received.

No need for 6 parallel TCP connections. One connection handles everything.

### Header compression (HPACK)

HTTP headers are repetitive. Every request sends `Host`, `User-Agent`, `Accept`, `Cookie`, etc. In HTTP/1.1, these are sent as plain text every time.

HPACK compresses headers using:

1. **Static table**: 61 common header name-value pairs (e.g., `:method: GET`, `:status: 200`). Referred to by index instead of sending the full string.
2. **Dynamic table**: Headers seen in previous requests on this connection. Once a header is seen, subsequent occurrences can be referenced by index.
3. **Huffman encoding**: String values are compressed using a static Huffman code.

In practice, HPACK reduces header overhead by 80-90% after the first few requests on a connection.

### Server push

HTTP/2 allows the server to proactively send resources the client hasn't requested yet. For example, when the client requests `index.html`, the server can push `style.css` and `app.js` without waiting for the client to discover and request them.

In practice, server push was rarely used correctly and was often counterproductive (pushing resources the client already had cached). Chrome removed support for server push in 2022. It exists in the spec but is effectively deprecated.

### Stream prioritization

Clients can assign priorities to streams, telling the server which responses to send first. For example, CSS and JS might be higher priority than images. This helps the browser render pages faster.

### HTTP/2 still has a problem

HTTP/2 solved HTTP-level HOL blocking but is still built on TCP. If a single TCP packet is lost, the TCP layer blocks all streams until that packet is retransmitted. This is **TCP-level head-of-line blocking** — and it's what HTTP/3 solves.

---

## Part 7: HTTP/3 and QUIC — Why UDP-Based

HTTP/3 replaces TCP with **QUIC** (originally Quick UDP Internet Connections), a transport protocol built on UDP.

### What QUIC provides

QUIC is essentially TCP + TLS + HTTP/2 multiplexing, redesigned as a single protocol on top of UDP:

- **Reliable delivery** (like TCP, but per-stream — loss in one stream doesn't block others)
- **Encryption by default** (TLS 1.3 built into the protocol — not a separate layer)
- **Connection migration** (if your IP changes — e.g., switching from Wi-Fi to cellular — the connection survives)
- **0-RTT connection establishment** (for resumed connections, data can be sent immediately)

### Why UDP?

QUIC uses UDP because:

1. **TCP is in the kernel.** Changing TCP behavior requires OS updates, which take years to deploy globally. QUIC runs in user space — it can be updated with application updates.
2. **TCP HOL blocking is fundamental.** TCP guarantees in-order delivery of the entire byte stream. You cannot have per-stream independence within a single TCP connection. QUIC implements its own per-stream delivery on top of UDP.
3. **Middlebox ossification.** Firewalls and NATs understand TCP deeply. They inspect TCP headers and sometimes modify them. This makes it impossible to deploy new TCP features. UDP packets are treated as opaque blobs by most middleboxes.

### 0-RTT resumption

When a client has previously connected to a server via QUIC, it can send data in the very first packet of a new connection — **zero round-trips** before sending application data.

Compare:
```
TCP + TLS 1.2:  1 RTT (TCP) + 2 RTT (TLS) = 3 RTT before first byte of HTTP
TCP + TLS 1.3:  1 RTT (TCP) + 1 RTT (TLS) = 2 RTT before first byte of HTTP
QUIC (resumed): 0 RTT before first byte of HTTP
QUIC (new):     1 RTT before first byte of HTTP (handshake + TLS combined)
```

### Production reality

Major services (Google, Facebook, Cloudflare) use HTTP/3 in production. Most CDNs support it. However, many enterprise networks block UDP or deprioritize it, so HTTP/3 implementations fall back to HTTP/2 over TCP when needed.

For backend engineers: you probably won't implement QUIC yourself, but understanding why it exists helps you make decisions about load balancers, CDNs, and protocol selection.

---

## Part 8: TLS — How Encryption Actually Works

TLS (Transport Layer Security) encrypts the communication between client and server. HTTPS is just HTTP over TLS.

### What TLS provides

1. **Confidentiality**: Data is encrypted. An attacker watching the network sees ciphertext, not your API responses.
2. **Integrity**: Data cannot be tampered with in transit. Any modification is detected.
3. **Authentication**: The client can verify the server's identity (and optionally vice versa).

### The TLS 1.3 handshake (simplified)

```
Client                                  Server
  |                                        |
  |  ──── ClientHello ────>                |
  |  (supported cipher suites,            |
  |   key share, supported versions)       |
  |                                        |
  |  <──── ServerHello ────                |
  |  (chosen cipher suite, key share)      |
  |  <──── Certificate ────               |
  |  <──── CertificateVerify ────         |
  |  <──── Finished ────                  |
  |                                        |
  |  ──── Finished ────>                   |
  |                                        |
  |  ═══ Encrypted data ═══               |
```

TLS 1.3 completes in **1 round-trip** (vs 2 for TLS 1.2). The key exchange happens in the first message, so encryption starts immediately after the handshake.

### Certificate chains

How does the client know the server is really `api.example.com` and not an impersonator?

1. The server presents a **certificate** containing: its hostname, its public key, and a digital signature from a **Certificate Authority (CA)**.
2. The client checks: Is this certificate issued by a CA I trust? Is the hostname correct? Is it expired? Is it revoked?
3. Trust is hierarchical: Root CA → Intermediate CA → Server certificate. The client has a pre-installed list of trusted root CAs.

### mTLS (mutual TLS)

In standard TLS, only the server proves its identity. In **mTLS**, the client also presents a certificate, and the server verifies it.

Used for:
- Service-to-service communication (microservices authenticating each other)
- Zero-trust networks
- API authentication (instead of API keys)

mTLS is stronger than API keys because the private key never leaves the client, but it's more complex to manage (certificate distribution, rotation, revocation).

### TLS termination

In production, TLS is often terminated at the load balancer or reverse proxy (Nginx, Cloudflare, AWS ALB). The connection between the load balancer and your backend is plain HTTP over the internal network.

```
Client ──[HTTPS]──> Load Balancer ──[HTTP]──> Your Backend
```

This simplifies backend code (no certificate management) and offloads CPU-intensive crypto to dedicated infrastructure. But the internal network must be trusted — if it's not, use mTLS between the load balancer and backends.

---

## Part 9: WebSockets — Persistent Bidirectional Communication

HTTP is request-response: the client sends a request, the server sends a response. The server cannot send data to the client without the client asking first.

WebSockets solve this by providing a **persistent, bidirectional, full-duplex** connection.

### The upgrade handshake

WebSocket connections start as HTTP and then upgrade:

```http
GET /chat HTTP/1.1
Host: api.example.com
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==
Sec-WebSocket-Version: 13
```

Server responds:

```http
HTTP/1.1 101 Switching Protocols
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=
```

After this handshake, the connection switches from HTTP to the WebSocket protocol. Both sides can send messages at any time.

### Framing

WebSocket messages are sent in frames:
- Text frames (UTF-8 strings)
- Binary frames (arbitrary bytes)
- Ping/pong frames (keepalive)
- Close frames (termination)

Frames can be fragmented — a large message can be split across multiple frames.

### When to use WebSockets

| Use case | Good fit? | Why |
|----------|-----------|-----|
| Chat applications | Yes | Bidirectional, real-time messages |
| Live dashboards | Maybe | SSE might be simpler if data flows one way |
| Collaborative editing | Yes | Low-latency bidirectional updates |
| Notifications | Maybe | SSE is often sufficient for push-only |
| File uploads | No | Regular HTTP with streaming is better |
| REST APIs | No | Request-response doesn't need persistent connections |

### Server-Sent Events (SSE) — the simpler alternative

SSE provides **server-to-client streaming** over a regular HTTP connection:

```http
HTTP/1.1 200 OK
Content-Type: text/event-stream

data: {"price": 150.23}

data: {"price": 150.45}

data: {"price": 149.87}
```

SSE is simpler than WebSockets:
- Uses standard HTTP (works through proxies, CDNs)
- Automatic reconnection built into the browser API
- Only server → client (not bidirectional)

Use SSE when you only need to push data from server to client. Use WebSockets when you need bidirectional communication.

### Long polling — the old way

Before WebSockets and SSE, real-time updates used **long polling**:

1. Client sends a request
2. Server holds the connection open (doesn't respond immediately)
3. When new data is available, server sends the response
4. Client immediately sends another request
5. Repeat

Long polling works but is wasteful — each "push" requires a full HTTP request/response cycle, and the server holds connections open that are mostly idle.

---

## Part 10: gRPC — RPC Over HTTP/2

gRPC is a remote procedure call (RPC) framework developed by Google. It uses HTTP/2 for transport and Protocol Buffers (protobuf) for serialization.

### Why gRPC exists

REST over JSON works well for many APIs, but has limitations:

| Limitation | gRPC solution |
|-----------|---------------|
| JSON is text-based and large | Protobuf is binary, 3-10x smaller |
| JSON parsing is relatively slow | Protobuf parsing is very fast |
| No formal schema enforcement | `.proto` files define exact schema |
| No built-in streaming | HTTP/2 streams support 4 streaming modes |
| No code generation | gRPC generates client/server code from `.proto` |

### Protocol Buffers

You define your data structures and services in `.proto` files:

```protobuf
syntax = "proto3";

service UserService {
  rpc GetUser (GetUserRequest) returns (User);
  rpc ListUsers (ListUsersRequest) returns (stream User);  // server streaming
}

message GetUserRequest {
  string id = 1;
}

message User {
  string id = 1;
  string name = 2;
  string email = 3;
}
```

The gRPC compiler generates strongly-typed client and server code in your chosen language.

### Four communication patterns

1. **Unary**: Client sends one request, server sends one response (like REST)
2. **Server streaming**: Client sends one request, server sends a stream of responses
3. **Client streaming**: Client sends a stream of requests, server sends one response
4. **Bidirectional streaming**: Both sides send streams of messages

### When to use gRPC

- **Internal service-to-service communication** where performance matters
- **Streaming data** (real-time feeds, long-running operations)
- **Polyglot environments** where services are written in different languages (gRPC generates code for 10+ languages)
- **Mobile clients on slow networks** where binary format reduces data transfer

### When NOT to use gRPC

- **Browser-facing APIs** (browsers don't natively support gRPC; you need gRPC-Web or a gateway)
- **Simple CRUD APIs** where REST + JSON is perfectly adequate
- **When human readability matters** (protobuf is binary — you can't `curl` a gRPC endpoint and read the response)

---

## Part 11: Connection Pooling — Why Opening Connections Is Expensive

Every TCP connection requires:
- A three-way handshake (1 RTT)
- TLS handshake if encrypted (1-2 RTT)
- TCP slow start (reduced initial throughput)
- A file descriptor on each side
- Memory for buffers and state

For a backend that makes 1000 database queries per second, opening a new TCP connection for each query would be catastrophic: 1000 handshakes, 1000 slow starts, 1000 TIME_WAIT sockets.

### How connection pooling works

A connection pool maintains a set of pre-established connections:

```
┌──────────────────────────────────────┐
│          Connection Pool             │
│                                      │
│  Connection 1: [idle]                │
│  Connection 2: [in use - query A]    │
│  Connection 3: [idle]                │
│  Connection 4: [in use - query B]    │
│  Connection 5: [idle]                │
│                                      │
│  Min: 2  |  Max: 10  |  Idle: 3     │
└──────────────────────────────────────┘
```

When your code needs a database connection:
1. Request a connection from the pool
2. The pool provides an idle connection (no handshake needed)
3. Use the connection for your query
4. Return the connection to the pool (it stays open for the next user)

### Pool configuration

| Setting | What it controls |
|---------|-----------------|
| **min** | Minimum connections to keep open, even when idle |
| **max** | Maximum connections allowed. If all are in use, new requests wait |
| **idleTimeoutMs** | How long an idle connection stays in the pool before being closed |
| **connectionTimeoutMs** | How long to wait for a connection from the pool before erroring |
| **acquireTimeoutMs** | How long to wait when all connections are busy |

### Pool exhaustion

If all connections in the pool are in use and a new request comes in, it waits. If it waits too long, it times out with a "connection pool exhausted" error.

Common causes:
- Pool max is too small for the workload
- Queries are too slow (connections are held too long)
- Connections are not being returned to the pool (leaked connections — typically from missing error handling)
- N+1 queries: a single request uses many connections

### Where pooling matters

- **Database connections** (PostgreSQL, MySQL, MongoDB): most critical. Database servers have connection limits too (PostgreSQL default: 100).
- **HTTP client connections**: when calling other services, reuse connections via a pool/agent.
- **Redis connections**: most Redis clients maintain a connection pool.

In Node.js, the `http.Agent` manages a pool of TCP connections for outgoing HTTP requests. By default, it uses `keepAlive: false` (in older versions), meaning every request opens a new connection. In production, configure it to reuse connections:

```typescript
import http from 'http';

const agent = new http.Agent({
  keepAlive: true,
  maxSockets: 50,        // max connections per host
  maxFreeSockets: 10,    // max idle connections to keep
  timeout: 60000,        // socket timeout
});
```

---

## Part 12: Putting It All Together — What Happens When You `curl https://api.example.com/users`

This is the canonical "what happens when" walkthrough. Every step below is a real thing that happens on the network.

```
1.  Shell parses the command and invokes curl.

2.  curl parses the URL: scheme=https, host=api.example.com, port=443, path=/users.

3.  DNS RESOLUTION
    curl calls getaddrinfo("api.example.com").
    OS checks /etc/hosts. No entry.
    OS checks its DNS cache. No cached result.
    OS sends a DNS query (UDP, port 53) to the configured resolver.
    Resolver checks its cache. Cache miss.
    Resolver asks a root nameserver: "Who handles .com?"
    Root responds with .com TLD nameservers.
    Resolver asks .com TLD: "Who handles example.com?"
    TLD responds with example.com's authoritative nameservers.
    Resolver asks authoritative NS: "What is the A record for api.example.com?"
    Authoritative NS responds: "93.184.216.34, TTL 3600."
    Resolver caches the result and returns it to the OS.
    OS caches the result and returns it to curl.

4.  TCP HANDSHAKE
    curl creates a socket (socket() syscall).
    curl initiates a connection to 93.184.216.34:443 (connect() syscall).
    Client → Server: SYN
    Server → Client: SYN-ACK
    Client → Server: ACK
    TCP connection established. ~1 RTT elapsed.

5.  TLS HANDSHAKE
    Client → Server: ClientHello (supported cipher suites, TLS version, key share)
    Server → Client: ServerHello + Certificate + CertificateVerify + Finished
    Client verifies the certificate chain.
    Client → Server: Finished
    TLS 1.3 session established. ~1 RTT elapsed.
    Total so far: ~2 RTT + DNS.

6.  HTTP REQUEST
    curl sends the HTTP request over the encrypted connection:
    GET /users HTTP/1.1
    Host: api.example.com
    Accept: */*
    User-Agent: curl/8.0.0

7.  SERVER PROCESSING
    The request travels through the network to the server.
    The server's load balancer receives it (possibly terminates TLS here).
    The request reaches your Node.js process.
    epoll_wait() returns — connection FD is readable.
    libuv reads the data. Node's HTTP parser parses it.
    Express matches the route. Your handler runs.
    Your handler queries the database (another TCP connection, another pool).
    Database returns results.
    Your handler calls res.json(users).
    Node serializes JSON, writes HTTP response headers and body to the socket.

8.  HTTP RESPONSE
    Server → Client: HTTP response over TLS over TCP.
    HTTP/1.1 200 OK
    Content-Type: application/json
    Content-Length: 256

    [JSON body]

9.  curl reads the response, prints it to stdout.

10. CONNECTION CLOSE (or keep-alive)
    If Connection: close, TCP four-way handshake closes the connection.
    If keep-alive, connection stays open for potential reuse.
```

Every layer — DNS, TCP, TLS, HTTP — is visible. Every step has a cost. Understanding these costs is what separates engineers who can optimize performance from those who just add more servers.

---

## Part 13: Common Misconceptions

### "HTTP is just GET and POST"

HTTP has 9 methods. `PUT`, `PATCH`, `DELETE`, `OPTIONS`, `HEAD` all have specific semantics. `OPTIONS` is crucial for CORS preflight. `HEAD` is important for cache validation. Ignoring them creates incomplete APIs.

### "HTTPS is slow"

TLS adds 1 RTT with TLS 1.3 (2 with TLS 1.2). For most applications, this is negligible compared to application processing time. With session resumption and 0-RTT, subsequent connections are even faster. The real cost is CPU for encryption, which is hardware-accelerated on all modern processors.

### "WebSockets are always better than REST for real-time"

WebSockets add complexity: connection management, reconnection logic, state synchronization, scaling across multiple server instances (requires sticky sessions or pub/sub). If your data flow is server → client only, SSE is simpler and works through CDNs and proxies.

### "HTTP/2 makes everything faster"

HTTP/2 eliminates HTTP-level HOL blocking but introduces TCP-level HOL blocking. For high-latency, lossy networks, HTTP/2 can actually be slower than HTTP/1.1 with multiple connections. HTTP/3 (QUIC) solves this.

### "DNS is instant"

DNS resolution can take 50-200ms for a cold lookup (no cache). If your Node.js application resolves many different hostnames, DNS latency adds up — and the lookups use the thread pool, which can become a bottleneck.

---

## Part 14: Interview Questions You Should Be Ready For

1. Walk me through what happens when you type a URL in a browser and press Enter.
2. What is the difference between TCP and UDP? When would you use each?
3. Explain the TCP three-way handshake. Why is it necessary?
4. What is TCP head-of-line blocking? How does HTTP/2 address it? How does HTTP/3?
5. How does DNS resolution work?
6. What is a TLS handshake and why does TLS 1.3 need fewer round-trips than 1.2?
7. What is mTLS and when would you use it?
8. How does HTTP keep-alive work and why does it matter?
9. What is connection pooling and why is it critical for database connections?
10. When would you use WebSockets vs Server-Sent Events vs long polling?
11. What is gRPC and when would you choose it over REST?
12. What is TCP congestion control and why does slow start affect new connections?
13. What is the TIME_WAIT state and why can it cause problems for high-throughput servers?
14. How does HTTP/2 multiplexing work?

---

## First-Principles Rules To Keep

1. The internet is layered: Link → IP → TCP/UDP → Application. Each layer has one job.
2. TCP guarantees delivery and ordering at the cost of handshakes, slow start, and HOL blocking.
3. UDP provides no guarantees but is fast. QUIC rebuilds reliability on UDP to avoid TCP's limitations.
4. DNS is a distributed database with caching at every level. Cold lookups are slow. In Node, they use the thread pool.
5. HTTP/1.1 is text-based and suffers from HOL blocking. HTTP/2 fixes this with binary multiplexing. HTTP/3 fixes TCP-level HOL blocking with QUIC.
6. TLS provides confidentiality, integrity, and authentication. TLS 1.3 completes in 1 RTT.
7. Every new TCP connection has overhead: handshake + TLS + slow start. Connection pooling amortizes this cost.
8. WebSockets provide persistent bidirectional communication. SSE is simpler for server-to-client only.
9. gRPC uses HTTP/2 + protobuf for efficient, typed, streaming RPC. Great for internal services, poor for browser-facing APIs.
10. Understanding network costs (RTT, handshakes, DNS, pooling) is what turns "add more servers" into "optimize the right layer."
