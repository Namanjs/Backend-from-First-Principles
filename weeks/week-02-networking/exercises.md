# Week 2 Exercises

## Goal

Make networking tangible. These exercises force you to see packets, handshakes, and protocol details that notes describe abstractly.

---

## Exercise 1: The Complete Request Trace

Trace what happens when you run `curl https://jsonplaceholder.typicode.com/posts/1` — not at a high level, but naming every network step.

### Requirements

1. Run the curl command with verbose output: `curl -v https://jsonplaceholder.typicode.com/posts/1`
2. Identify and document each phase from the verbose output:
   - DNS resolution (which IP did it resolve to?)
   - TCP handshake (can you spot the connection establishment?)
   - TLS handshake (what TLS version? what cipher suite? what certificate?)
   - HTTP request (what headers were sent?)
   - HTTP response (what status? what headers? Content-Type? Content-Length?)
   - Connection close or keep-alive?

3. Run it again with timing: `curl -w "\nDNS: %{time_namelookup}s\nTCP: %{time_connect}s\nTLS: %{time_appconnect}s\nFirst byte: %{time_starttransfer}s\nTotal: %{time_total}s\n" -o /dev/null -s https://jsonplaceholder.typicode.com/posts/1`

4. Document the time for each phase and calculate how much of the total time is network overhead vs server processing.

### After completing

Write answers to:

1. What percentage of the total time was spent on DNS + TCP + TLS vs actual data transfer?
2. If you run the command a second time, which phases are faster and why?
3. How would keep-alive affect subsequent requests to the same host?

---

## Exercise 2: TCP Echo Server with Connection Tracking

Extend the Week 1 TCP server into a more sophisticated version that demonstrates TCP behavior.

### Requirements

Build a TCP server that:

1. Tracks all active connections (store remote address, connect time, bytes received, bytes sent)
2. Supports these commands from any connected client:
   - `ECHO <message>` — echoes the message back
   - `TIME` — returns the server's current timestamp
   - `STATS` — returns total connections, active connections, total bytes transferred
   - `CONNS` — returns a list of all active connections
   - `QUIT` — closes the client's connection gracefully

3. Logs every connection and disconnection with timestamps
4. Handles abrupt client disconnects without crashing
5. Implements a 60-second idle timeout (disconnect clients that send nothing for 60 seconds)

### Why this exercise exists

This forces you to manage TCP connection lifecycle, handle protocol parsing (splitting incoming data into commands), and deal with connection state. These are the exact same concerns that HTTP servers handle — you're just doing it without a framework hiding the details.

### After completing

Write answers to:

1. How does your server know when a command ends and another begins? (Hint: TCP is a byte stream, not a message stream. What if one `data` event contains two commands? What if one command spans two `data` events?)
2. What happens if a client sends data faster than your server can process it? (backpressure)
3. How does your idle timeout work at the implementation level?

---

## Exercise 3: HTTP Server Without Express

Build an HTTP server using only Node's built-in `http` module. No Express. No frameworks.

### Requirements

Create a server that handles:

1. `GET /` — returns JSON: `{ "message": "Hello from raw HTTP" }`
2. `GET /users` — returns a hardcoded list of users as JSON
3. `POST /users` — reads a JSON body, adds a user, returns 201 with the created user
4. `GET /stream` — returns a streaming response (send one chunk every 500ms, 5 chunks total, then end)
5. Any other path — returns 404 with `{ "error": "Not found" }`

Requirements:
- Set correct `Content-Type` headers
- Set correct status codes
- Parse the request body manually for POST (no `body-parser`)
- The `/stream` response must use chunked transfer encoding (call `res.write()` multiple times)
- Implement proper error handling for malformed JSON in POST body

### Why this exercise exists

Express is a thin layer over `http.createServer()`. By building without it, you see exactly what Express does for you: routing, body parsing, content-type handling, and middleware. When you go back to Express, nothing will be mysterious.

### After completing

Write answers to:

1. What does `http.createServer()` actually create at the OS level?
2. How does Node determine when the request body is complete?
3. What HTTP header tells the client that the response will be chunked?
4. What does Express's `express.json()` middleware actually do? (You just implemented it yourself)

---

## Exercise 4: Connection Pooling Experiment

Demonstrate the performance difference between pooled and unpooled HTTP connections.

### Requirements

1. Set up a simple target server (can be Express, can be the raw HTTP server from Exercise 3)
2. Write a client script that makes 100 sequential HTTP requests to the server
3. Run it **without** a keep-alive agent (each request opens a new connection)
4. Run it **with** a keep-alive agent:

```typescript
import http from 'http';

const agent = new http.Agent({ keepAlive: true, maxSockets: 10 });
```

5. Measure and compare:
   - Total time for 100 requests
   - Average time per request
   - Number of TCP connections created (you can check with `netstat` or `ss`)

### After completing

Write answers to:

1. How much faster was the pooled version? Why?
2. How many TCP connections were created in each scenario?
3. What is TIME_WAIT? Run `ss -t state time-wait | wc -l` after the unpooled version. What do you see?
4. How does this apply to database connections?

---

## Exercise 5: WebSocket Chat Server

Build a simple chat server using WebSockets.

### Requirements

1. Create a WebSocket server (use the `ws` library)
2. When a client connects, assign them an ID and broadcast `"User <id> joined"` to all others
3. When a client sends a message, broadcast it to all other connected clients as `"User <id>: <message>"`
4. When a client disconnects, broadcast `"User <id> left"`
5. Add a `/stats` HTTP endpoint that returns current connection count

6. Create a simple client script that connects and allows sending messages from the terminal

### Extension (if time permits):

7. Add a ping/pong heartbeat — if a client doesn't respond to a ping within 30 seconds, disconnect them
8. Add message rate limiting — a client can send at most 10 messages per second

### After completing

Write answers to:

1. How does the WebSocket upgrade handshake work? What HTTP status code does it use?
2. Why can't you use a regular CDN or HTTP cache in front of WebSocket connections?
3. If you have 3 server instances behind a load balancer, how do you ensure User A on Server 1 can send messages to User B on Server 2?
4. When would SSE be a better choice than WebSockets for this use case?

---

## Exercise 6: DNS Investigation

Investigate DNS behavior and its impact on your applications.

### Requirements

1. Use `dig` (or `nslookup`) to manually resolve several hostnames:
   ```bash
   dig api.github.com
   dig google.com
   dig +trace api.github.com   # shows the full resolution chain
   ```

2. Document: What IP addresses were returned? What was the TTL? Were there CNAME records?

3. Write a Node.js script that:
   - Resolves a hostname using `dns.lookup()` (thread pool) and `dns.resolve4()` (c-ares) separately
   - Times both methods
   - Runs 20 concurrent resolutions of different hostnames with each method
   - Reports which method was faster and by how much

4. Demonstrate thread pool saturation:
   - Set `UV_THREADPOOL_SIZE=2`
   - Run 10 concurrent `dns.lookup()` calls
   - Simultaneously run a `fs.readFile()` call
   - Observe: does the file read get delayed by the DNS lookups?

### After completing

Write answers to:

1. What is the difference between `dns.lookup()` and `dns.resolve4()` in Node.js?
2. Why did `fs.readFile()` get delayed when DNS lookups saturated the thread pool?
3. In a Kubernetes environment, what DNS server resolves service names?
4. What would happen if your DNS resolver was unreachable?

---

## Exercise 7: TLS Certificate Inspection

Understand TLS by inspecting real certificates.

### Requirements

1. Use `openssl` to inspect a website's TLS certificate:
   ```bash
   echo | openssl s_client -connect api.github.com:443 -servername api.github.com 2>/dev/null | openssl x509 -text -noout
   ```

2. Document:
   - What is the subject (who is the certificate for)?
   - Who issued it (the Certificate Authority)?
   - When does it expire?
   - What signature algorithm is used?
   - What is the public key type and size?

3. Check the full certificate chain:
   ```bash
   echo | openssl s_client -connect api.github.com:443 -servername api.github.com -showcerts 2>/dev/null
   ```

4. How many certificates are in the chain? What is the root CA?

5. Test TLS version negotiation:
   ```bash
   echo | openssl s_client -connect api.github.com:443 -tls1_2 2>/dev/null | grep "Protocol"
   echo | openssl s_client -connect api.github.com:443 -tls1_3 2>/dev/null | grep "Protocol"
   ```

### After completing

Write answers to:

1. Why does a certificate chain exist? Why not just have the server's certificate signed directly by a root CA?
2. What happens if a certificate expires? What error would the client see?
3. What is SNI (Server Name Indication) and why is it needed?
4. Why is TLS termination at the load balancer a common pattern?

---

## Project Piece

This week's contribution to the capstone:

Build an **HTTP client library wrapper** that:

- Creates and manages a connection pool (using `http.Agent` with keep-alive)
- Supports GET, POST, PUT, DELETE methods
- Automatically sets content-type headers
- Parses JSON responses
- Implements request timeout
- Implements basic retry logic (retry on network errors, not on 4xx)
- Logs request method, URL, status code, and duration for every request

This will be used in later weeks when your services need to communicate with each other and with databases.

---

## Pass Gate

You do not pass because the code runs.

You pass if:

- You can trace a real HTTP request using `curl -v` and explain every line of output
- You can build an HTTP server without a framework and explain what the framework normally handles
- You can demonstrate and measure the performance difference of connection pooling
- You can investigate DNS resolution and explain why it matters for Node.js performance
- You can inspect TLS certificates and explain the trust chain
- You can build a WebSocket server and explain when WebSockets are the right choice
- Your explanations reference specific protocol details (sequence numbers, handshake steps, header compression), not vague descriptions
