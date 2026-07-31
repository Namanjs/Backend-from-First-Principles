# Week 1 Exercises

## Goal

Build a runtime model strong enough that the OS-level behavior of your backend code becomes visible and predictable. These exercises force you to see what the notes describe.

---

## Exercise 1: Raw TCP Server (No Express, No HTTP)

Build a TCP echo server using Node's `net` module. No Express. No HTTP.

### Requirements

- Listen on port 4000
- When a client connects, log: `"Client connected: <remote address>:<remote port>"`
- When the client sends data, echo it back with a prefix: `"Echo: <data>"`
- When the client disconnects, log: `"Client disconnected"`
- Handle multiple simultaneous connections (test with multiple telnet/netcat sessions)

### Why this exercise exists

Express, Fastify, and every HTTP framework are built on top of TCP sockets. This exercise strips away the abstraction and makes you work with the raw transport layer. You will see that a "server" is fundamentally: create a socket, bind it, listen, accept connections, read/write data.

### Acceptance criteria

- You can connect with `telnet localhost 4000` or `nc localhost 4000`
- You can type messages and see them echoed back
- You can connect multiple clients simultaneously
- Each client gets its own independent echo session
- The server does not crash when a client disconnects abruptly

### After completing

Write short answers to:

1. What system calls does `net.createServer()` and `server.listen(4000)` ultimately trigger?
2. How many file descriptors does your server have open with 3 clients connected?
3. Why can one Node.js thread handle multiple clients simultaneously here?

---

## Exercise 2: Blocking vs Non-Blocking Demonstration

Create a server with two routes that demonstrates the difference between I/O-bound waiting and CPU-bound blocking.

### Requirements

Create an Express server with these routes:

**`GET /wait`** — Simulates I/O waiting. Use `setTimeout` or a promise-based delay of 3 seconds, then respond. This simulates a slow database query.

**`GET /block`** — Performs actual CPU-bound blocking. Use a synchronous loop that runs for approximately 3 seconds (`Date.now()` comparison loop), then responds.

**`GET /fast`** — Returns immediately with `{ status: "ok" }`.

### The test

1. Start the server
2. In one terminal: `curl http://localhost:3000/wait`
3. In another terminal (while /wait is still waiting): `curl http://localhost:3000/fast`
4. Observe: `/fast` responds immediately. The 3-second wait on `/wait` does not affect other requests.

Now repeat with `/block`:

1. In one terminal: `curl http://localhost:3000/block`
2. In another terminal: `curl http://localhost:3000/fast`
3. Observe: `/fast` is delayed by approximately 3 seconds. The blocking route freezes the entire server.

### After completing

Write answers to:

1. Why does `/wait` not block other requests but `/block` does?
2. What is the event loop doing during the 3-second wait in `/wait`?
3. What is the event loop doing during the 3-second block in `/block`?
4. In what event loop phase does the `/wait` callback execute?
5. If a production route accidentally contained a CPU-heavy operation, how would you detect it?

---

## Exercise 3: File Descriptor Investigation

Write a script that opens many file handles and observes the limit.

### Requirements

1. Write a script that opens files in a loop (create temporary files or open `/dev/null` repeatedly) without closing them
2. Count how many you can open before hitting `EMFILE`
3. Log the FD number of each opened file
4. Catch the `EMFILE` error and log: `"Hit FD limit at <count> open files"`
5. Check the current limit with a child process executing `ulimit -n`

### After completing

Write answers to:

1. What was your FD limit?
2. Why did the FD numbers start at 3 (not 0)?
3. In a real server, what resources consume file descriptors?
4. How would you increase the limit in production?

---

## Exercise 4: Process Signals and Graceful Shutdown

Build a server that handles shutdown signals correctly.

### Requirements

Create an Express server that:

1. Starts and logs `"Server started on port 3000, PID: <pid>"`
2. Handles `SIGTERM`:
   - Logs `"SIGTERM received. Starting graceful shutdown..."`
   - Stops accepting new connections (`server.close()`)
   - Waits for in-flight requests to complete (set a reasonable timeout)
   - Logs `"Graceful shutdown complete"`
   - Exits with code 0
3. Handles `SIGINT` (Ctrl+C) the same way
4. Has a route `GET /slow` that takes 5 seconds (simulated async work)

### The test

1. Start the server
2. Send a request to `GET /slow`
3. While that request is in-flight, send `SIGTERM` from another terminal: `kill <pid>`
4. Observe: the in-flight request should complete successfully, then the server should shut down

### After completing

Write answers to:

1. What is the difference between `SIGTERM` and `SIGKILL`?
2. Why can't you handle `SIGKILL`?
3. What happens in Kubernetes when a pod is terminated? What signal is sent first?
4. Why does `server.close()` not immediately kill existing connections?
5. What happens if you don't handle `SIGTERM` and the process receives it?

---

## Exercise 5: Thread Pool Saturation

Demonstrate that libuv's thread pool can become a bottleneck.

### Requirements

1. Create a script that performs many concurrent `fs.readFile()` operations (e.g., 20 simultaneous reads of large files)
2. Measure how long each read takes
3. Run it with the default thread pool size (`UV_THREADPOOL_SIZE=4`)
4. Run it again with `UV_THREADPOOL_SIZE=16`
5. Compare the timing results

### The observation

With 20 concurrent reads and 4 thread pool threads, only 4 reads execute at a time. The rest queue up. With 16 threads, more reads execute concurrently.

### After completing

Write answers to:

1. Why does `fs.readFile()` use the thread pool instead of epoll?
2. What other operations use the thread pool?
3. Why is the default thread pool size only 4?
4. In what scenarios would you increase `UV_THREADPOOL_SIZE` in production?
5. Why doesn't network I/O (like HTTP requests) use the thread pool?

---

## Exercise 6: Event Loop Phases Visualizer

Write a script that demonstrates the order of execution across event loop phases.

### Requirements

Create a script that schedules work in every event loop mechanism:

```typescript
// Schedule work in different phases and predict the order
console.log('sync 1');

setTimeout(() => console.log('setTimeout 0'), 0);
setTimeout(() => console.log('setTimeout 100'), 100);

setImmediate(() => console.log('setImmediate 1'));
setImmediate(() => {
  console.log('setImmediate 2');
  process.nextTick(() => console.log('nextTick inside setImmediate'));
  Promise.resolve().then(() => console.log('promise inside setImmediate'));
});

process.nextTick(() => console.log('nextTick 1'));
process.nextTick(() => {
  console.log('nextTick 2');
  process.nextTick(() => console.log('nested nextTick'));
});

Promise.resolve().then(() => console.log('promise 1'));
Promise.resolve().then(() => {
  console.log('promise 2');
  process.nextTick(() => console.log('nextTick inside promise'));
});

fs.readFile(__filename, () => {
  console.log('fs.readFile callback');
  setTimeout(() => console.log('setTimeout inside fs'), 0);
  setImmediate(() => console.log('setImmediate inside fs'));
});

console.log('sync 2');
```

### The exercise

1. **Before running**: write down your predicted output order and explain why
2. **Run the script** and compare
3. **Explain every mismatch** — if your prediction was wrong, understand why
4. **Create 5 more snippets** of your own that combine these mechanisms in different ways
5. For each, predict first, then verify

### After completing

Write a summary document explaining:

1. The order of priority: sync → nextTick → microtasks → timers/check/poll
2. Why nextTick drains completely before promise microtasks
3. Why setImmediate inside an I/O callback always runs before setTimeout 0
4. What happens when you schedule nextTick recursively (and why it's dangerous)

---

## Exercise 7: Container Resource Limits (Optional — requires Docker)

Demonstrate how container resource limits affect a Node.js process.

### Requirements

1. Create a simple Express server
2. Create a Dockerfile for it
3. Run it with a 128MB memory limit: `docker run --memory=128m your-image`
4. In the server, create a route that allocates memory in a loop:
   ```typescript
   app.get('/leak', (req, res) => {
     const arrays: number[][] = [];
     for (let i = 0; i < 1000; i++) {
       arrays.push(new Array(100000).fill(i));
     }
     res.json({ allocated: arrays.length });
   });
   ```
5. Hit the `/leak` endpoint and observe what happens
6. Check Docker logs: `docker logs <container-id>`
7. Add `--max-old-space-size=96` to the Node command and observe the difference

### After completing

Write answers to:

1. What happened when the process exceeded the container's memory limit?
2. What is the OOM killer and how does it work?
3. Why should `--max-old-space-size` be smaller than the container's memory limit?
4. What signal does the OOM killer send? Can the process catch it?

---

## Project Piece

This week's contribution to the capstone:

Build a **minimal TCP server framework** (not an HTTP framework — lower level) that:

- Creates a TCP server
- Accepts connections
- Parses a simple text-based protocol (e.g., `COMMAND arg1 arg2\n`)
- Routes commands to handler functions
- Handles graceful shutdown on SIGTERM/SIGINT
- Logs connections with timestamps

This is not meant to be used in production. It is meant to prove to yourself that you understand what frameworks like Express are built on top of. If you can build a simple protocol server from sockets, HTTP frameworks lose their mystery.

---

## Pass Gate

You do not pass because the code runs.

You pass if:

- You can build a TCP server from the `net` module and explain what system calls it triggers
- You can demonstrate and explain the difference between I/O waiting and CPU blocking
- You can explain what file descriptors are and why they have limits
- You can implement graceful shutdown and explain why it matters
- You understand when the libuv thread pool is used and when it isn't
- You can predict event loop execution order with reasonable accuracy
- Your explanations reference OS-level mechanisms, not just Node.js API descriptions
