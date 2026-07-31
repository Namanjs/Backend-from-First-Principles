# Week 2 — Exercise 1: The Complete Request Trace

## curl -v Output Analysis

**DNS Resolution**
Resolved `jsonplaceholder.typicode.com` to:
- IPv4: `104.21.59.19`, `172.67.167.151`
- IPv6: `2606:4700:3037::ac43:a797`, `2606:4700:3033::6815:3b13`

curl connected to `104.21.59.19:443`.

**TCP Handshake**
Three-way handshake happened invisibly underneath. curl connected to port 443 successfully.

**TLS Handshake**
- TLS version: TLSv1.3
- Cipher suite: `TLS_AES_256_GCM_SHA384`
- Key exchange: `X25519`
- Certificate: wildcard `*.typicode.com`, issued by Google Trust Services, valid until August 2026
- Server accepted HTTP/2 via ALPN negotiation

**HTTP Request**
- Method: GET
- Protocol: HTTP/2
- Headers sent: `:method`, `:scheme`, `:authority`, `:path`, `user-agent`, `accept`

**HTTP Response**
- Status: 200 OK
- Content-Type: `application/json; charset=utf-8`
- Content-Length: 292 bytes
- `cf-cache-status: HIT` — Cloudflare served this from cache, not the origin server

**Connection**
`Connection #0 left intact` — keep-alive, connection was not closed after the request.

---

## Timing Results

| Phase | Run 1 | Run 2 |
|-------|-------|-------|
| DNS | 0.000951s | 0.000773s |
| TCP connect | 0.069645s | 0.076222s |
| TLS complete | 0.140982s | 0.155868s |
| First byte | 0.221645s | 0.238304s |
| Total | 0.221680s | 0.238338s |

Calculated phase durations (Run 1):
- DNS: ~0.95ms
- TCP handshake: ~68.7ms
- TLS handshake: ~71.3ms
- Server processing + transfer: ~80ms
- Data transfer: ~0.035ms (292 bytes, essentially instant)

---

## Reflection Questions

**Q1. What percentage of the total time was spent on DNS + TCP + TLS vs actual data transfer?**

DNS + TCP + TLS combined took ~141ms out of a total 221ms — approximately 64% of the total request time was pure network overhead before a single byte of actual data was exchanged. The data transfer itself (292 bytes) was essentially instant at ~0.035ms.

---

**Q2. If you run the command a second time, which phases are faster and why?**

In this case the second run was not meaningfully faster — the request payload is too small to show a dramatic difference. However DNS was slightly faster on the second run (0.77ms vs 0.95ms) because the OS cached the DNS result from the first lookup. TCP and TLS remain similar because curl opens a new connection each time it runs, so the full handshake happens again regardless.

---

**Q3. How would keep-alive affect subsequent requests to the same host?**

Keep-alive reuses the existing TCP connection and TLS session for subsequent requests, eliminating the ~140ms of TCP + TLS handshake overhead on every request after the first. DNS is cached by the OS independently of keep-alive, so that overhead is already minimal. In practice, keep-alive turns a 221ms request into roughly an 80ms request for subsequent calls to the same host within the same connection lifetime.