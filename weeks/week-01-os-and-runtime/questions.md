# Week 1 Questions

Answer in your own words. If you use terms like "blocking," "file descriptor," "thread pool," or "event loop," explain what they mean mechanistically.

---

## Section A: Processes and Threads

### 1. What is a process?

Answer:

A process is a running instance of a program, managed by the operating system. The OS allocates it a virtual address space, at least one thread of execution, a file descriptor table, and a process control block that tracks its state. It is not "your code" — it is the OS-managed environment in which your code runs.

### 2. What happens at the OS level when you type `node server.js` in a terminal?

Answer:

The shell process calls `fork()` to create a child process. The child then calls `exec()` to replace its own code with the Node.js binary. Node.js initializes V8, libuv, and the event loop, then loads and begins executing `server.js`. The original shell process waits for the child or continues running.

### 3. What is the difference between a process and a thread?

Answer:

A process has its own virtual address space, file descriptor table, and PID. Threads exist within a process and share its address space and file descriptors, but each thread has its own call stack, program counter, and CPU register state. Threads can run concurrently on different CPU cores. Processes are isolated from each other; threads within a process are not.

### 4. Why do threads sharing memory create problems?

Answer:

Because two threads can read and write the same memory location simultaneously without coordination, leading to race conditions — bugs where the result depends on the timing of thread execution. These bugs are intermittent and hard to reproduce. Solving this requires synchronization primitives like mutexes, which add complexity and can cause deadlocks if used incorrectly.

### 5. What is the difference between green threads and OS threads?

Answer:

OS threads are managed by the operating system kernel. The kernel schedules them, preempts them, and allocates CPU time. They typically use ~1MB of stack memory each. Green threads are managed by the language runtime, not the kernel. The runtime multiplexes many green threads onto a small number of OS threads. They are much cheaper to create (e.g., Go goroutines use ~2KB of stack). The OS sees only the underlying OS threads.

### 6. What are coroutines and how does `async/await` relate to them?

Answer:

Coroutines are functions that can voluntarily pause and resume execution. JavaScript's `async/await` is a form of coroutine: when a function hits `await`, it pauses and yields control back to the event loop. When the awaited operation completes, the function resumes. Unlike threads, coroutines are not preempted — they yield at explicit points.

### 7. What is `SIGTERM` and why does it matter for backend services?

Answer:

`SIGTERM` (signal 15) is a polite shutdown request sent to a process. It means "please clean up and exit." The process can catch it and perform cleanup — closing database connections, finishing in-flight requests, draining connections. This matters because orchestrators like Kubernetes send `SIGTERM` first, wait a grace period, then send `SIGKILL` (which cannot be caught). Without a `SIGTERM` handler, your process dies abruptly, potentially leaving connections open and requests half-processed.

### 8. What process states exist, and why does it matter for debugging?

Answer:

The main states are: Running (executing on CPU), Ready (runnable but waiting for CPU time), Blocked (waiting for I/O or a signal), Zombie (finished but parent hasn't read exit status), and Stopped (paused by a signal). This matters because "my server is slow" has different meanings: if the process is mostly in Blocked state, it's I/O-bound (waiting for database/network). If it's mostly in Running state, it's CPU-bound. If it's in Ready state, other processes are starving it for CPU time. Each diagnosis leads to a different solution.

---

## Section B: Memory

### 9. What are the main regions of a process's memory layout?

Answer:

From low to high addresses: Text (the compiled code instructions), Data (initialized global variables), BSS (uninitialized global variables), Heap (dynamically allocated memory, grows upward), free space, and Stack (function call frames with local variables and return addresses, grows downward).

### 10. What is the difference between stack and heap memory?

Answer:

The stack stores function call frames — local variables, arguments, and return addresses. It is LIFO, automatically managed, and extremely fast to allocate from (just moving a pointer). It has a fixed maximum size. The heap stores dynamically allocated objects that may outlive the function that created them. It requires explicit allocation and deallocation (or garbage collection). In JavaScript, almost everything lives on the heap — objects, arrays, strings, closures.

### 11. What causes a stack overflow?

Answer:

Exceeding the stack's fixed maximum size, usually through deep or infinite recursion. Each recursive call pushes a new frame onto the stack. If the recursion doesn't terminate (or is very deep), the stack runs out of space.

### 12. What is a memory leak in JavaScript, and how does it manifest?

Answer:

A memory leak occurs when objects on the heap remain referenced but are never used again, so the garbage collector cannot reclaim them. In Node.js, this manifests as the process's memory usage growing over time until it hits the V8 heap limit and crashes with an out-of-memory error. Common causes: event listeners never removed, growing arrays or maps used as unbounded caches, closures capturing large objects, and global variables that accumulate data.

### 13. What is V8's heap limit and why does it exist?

Answer:

V8 limits its heap to approximately 1.5-2 GB by default on 64-bit systems. This limit exists to keep garbage collection pauses reasonable — a larger heap means GC has more memory to scan. You can increase it with `--max-old-space-size`, but if your process consistently approaches the limit, the real fix is finding the leak or reducing memory usage, not increasing the limit indefinitely.

---

## Section C: File Descriptors and System Calls

### 14. What is a file descriptor?

Answer:

A file descriptor is a small non-negative integer that the kernel uses to identify an open I/O channel within a process. When a process opens a file, socket, pipe, or device, the kernel assigns it an FD. The process uses that integer for all subsequent read, write, and close operations on that resource. Every process starts with three: 0 (stdin), 1 (stdout), 2 (stderr).

### 15. Why is the "everything is a file" design important for event-driven servers?

Answer:

Because files, sockets, pipes, and devices all share the file descriptor interface, the OS can provide a single mechanism (like epoll) to watch all of them simultaneously. An event-driven server can monitor thousands of sockets, file operations, and pipes using one system call (`epoll_wait`), and the OS treats them uniformly. Without this design, different I/O types would need different monitoring mechanisms.

### 16. What is the `EMFILE` error and when would a Node.js server hit it?

Answer:

`EMFILE` means "too many open files." Each process has a limit on how many file descriptors it can have open simultaneously (often 1024 by default). A server handling many concurrent connections — where each connection is a file descriptor — can exhaust this limit. The fix is to increase the limit with `ulimit -n` or the equivalent system configuration. In production, 65535 or higher is common.

### 17. What is a system call and why does it matter?

Answer:

A system call is the mechanism by which user-space code requests a service from the kernel — reading a file, sending network data, creating a process. The CPU switches from user mode to kernel mode, the kernel performs the operation, and control returns to user mode. This mode switch has a cost, which is why buffered I/O (batching many small reads/writes into fewer large ones) outperforms unbuffered I/O.

### 18. What system calls does `server.listen(3000)` trigger?

Answer:

At minimum: `socket()` to create a network socket, `bind()` to bind it to address 0.0.0.0 and port 3000, and `listen()` to mark the socket as accepting incoming connections. libuv then registers the socket's file descriptor with epoll (via `epoll_ctl`) so the event loop is notified when clients try to connect.

---

## Section D: I/O Models

### 19. What is blocking I/O?

Answer:

When a thread makes a blocking I/O system call (like `read()` on a socket), the thread is suspended by the kernel until data is available. The thread does nothing useful during this wait. This model requires one thread per concurrent I/O operation, which scales poorly for many connections.

### 20. What is non-blocking I/O?

Answer:

When a file descriptor is set to non-blocking mode, a `read()` call returns immediately — either with data (if available) or with an EAGAIN/EWOULDBLOCK error (if no data is ready yet). The thread is never suspended. However, naive polling (calling read in a loop) wastes CPU.

### 21. What is I/O multiplexing and why is it the key to high-performance servers?

Answer:

I/O multiplexing allows a single thread to monitor many file descriptors simultaneously and be notified when any of them are ready for I/O. Instead of blocking on one FD or busy-polling many, the thread makes one call (like `epoll_wait`) that efficiently blocks until at least one FD has activity. This is what makes it possible for one thread to handle thousands of concurrent connections.

### 22. How does epoll differ from select/poll?

Answer:

`select` and `poll` require the kernel to scan the entire list of watched file descriptors on every call — O(n) per call. `epoll` registers FDs once and maintains the watch list in the kernel. `epoll_wait` returns only the FDs that are ready — O(1) per ready FD, regardless of total watched FDs. This makes epoll vastly more efficient at scale (thousands of connections).

### 23. What is the difference between I/O multiplexing (epoll) and true async I/O (io_uring)?

Answer:

With epoll, the kernel tells you "this FD is ready for reading" — you still need to call `read()` yourself. With true async I/O like io_uring, you submit a read request, and the kernel performs the actual read and delivers the completed data to you. io_uring also reduces system call overhead by using shared memory ring buffers between user space and kernel space.

---

## Section E: Event Loop

### 24. In the simplest terms, what is an event loop?

Answer:

A loop that waits for I/O events (using something like epoll), then runs the handlers/callbacks registered for those events. It keeps repeating until there's nothing left to do. Every iteration: wait for events → handle ready events → repeat.

### 25. Why does CPU-intensive code break the event loop model?

Answer:

Because the event loop runs handlers on a single thread, one at a time. If a handler does CPU-intensive work (e.g., a tight loop for 5 seconds), the event loop is occupied for that entire duration. No other handlers can run. All other connections are stalled — even though their I/O might be ready. The event loop model assumes each handler completes quickly.

### 26. Name three systems besides Node.js that use an event loop internally.

Answer:

Nginx (uses epoll with multiple worker processes), Redis (single-threaded event loop for in-memory operations using its ae library), and Python's asyncio (single-threaded event loop using selectors). Go's runtime uses a different model (goroutine scheduler + netpoll) but the underlying principle of I/O multiplexing is the same.

### 27. What are the phases of the libuv event loop?

Answer:

Timers (setTimeout/setInterval callbacks), pending callbacks (deferred I/O callbacks), idle/prepare (internal), poll (retrieve new I/O events and run their callbacks — where most time is spent), check (setImmediate callbacks), close callbacks (e.g., socket close events). Between each phase, microtasks are processed: `process.nextTick()` callbacks first, then promise continuations.

### 28. Why does `process.nextTick()` run before promise callbacks?

Answer:

By design in Node.js, `process.nextTick()` has higher priority than promise microtasks. The nextTick queue is drained completely between every event loop phase and before processing the promise microtask queue. This gives nextTick callbacks the ability to run before any other scheduled asynchronous work, which is why overusing it can starve the event loop.

---

## Section F: Node.js Runtime

### 29. What are the four main components of Node.js?

Answer:

V8 (Google's JavaScript engine — compiles and executes JS, manages the JS heap and garbage collection), libuv (cross-platform async I/O library — provides the event loop, thread pool, async sockets, timers, and file operations), Node.js C++ bindings (connect V8 to libuv, translating JS calls into OS operations), and the Node.js standard library (JavaScript modules like http, fs, net, crypto built on top of the bindings).

### 30. What is libuv's thread pool and when is it used?

Answer:

libuv's thread pool is a small pool of OS threads (default 4, configurable via `UV_THREADPOOL_SIZE` up to 1024) used for operations that don't have non-blocking OS-level APIs. File system operations (most FS syscalls on Linux are blocking), DNS lookups (`getaddrinfo` is blocking), some crypto operations, and zlib compression use the thread pool. Network I/O does NOT use the thread pool — it uses epoll/kqueue directly.

### 31. Why is the distinction between "network I/O uses epoll" and "file I/O uses the thread pool" important?

Answer:

Because it affects performance characteristics and bottlenecks differently. Network I/O (database connections, HTTP calls) scales with the event loop and epoll — no thread pool limitation. But if your application does many concurrent file operations or DNS lookups, they compete for the 4 default thread pool threads, creating a queue. This can cause unexpected latency even though the CPU is idle. The solution is either increasing `UV_THREADPOOL_SIZE` or using streaming/batched approaches.

### 32. Trace the complete lifecycle of an HTTP request hitting an Express server, from the OS level.

Answer:

The event loop is sitting in `epoll_wait()`, watching the server socket FD. A client connects — OS completes TCP handshake, makes the connection FD readable. `epoll_wait()` returns. libuv calls `accept()` to get the new connection's FD, registers it with epoll for read events. The client sends HTTP data — connection FD becomes readable. `epoll_wait()` returns again. libuv reads the raw bytes with `read()`. Node's HTTP parser (llhttp) parses them into a request object and fires JS callbacks. Express matches the request to a route handler. The handler runs on V8's main thread. If the handler does `await db.query()`, the database client sends data through a socket (non-blocking via epoll), the handler is suspended, the event loop continues processing other events. When the DB response arrives, the socket becomes readable, epoll reports it, libuv reads the data, the promise resolves, the handler resumes, and `res.json()` calls `write()` on the connection FD to send the response back.

---

## Section G: Containers

### 33. What is the difference between a container and a virtual machine?

Answer:

A VM runs a full operating system with its own kernel on top of a hypervisor. It provides strong isolation but has significant overhead (memory for the guest OS, slower startup). A container shares the host's kernel and uses Linux namespaces for isolation (separate PID, network, filesystem views) and cgroups for resource limits (CPU, memory). Containers start faster, use less memory, and have less overhead, but provide weaker isolation than VMs.

### 34. What are namespaces and cgroups?

Answer:

Namespaces give a process an isolated view of system resources — its own PID space, network interfaces, filesystem mounts, hostname, and user IDs. The process thinks it's the only thing running. Cgroups (control groups) limit how much of a resource a process can use — maximum memory, CPU time, I/O bandwidth. Together, namespaces provide isolation and cgroups provide resource limits — these two features are the foundation of containers.

### 35. Why might a Node.js process behave differently inside a container than outside?

Answer:

Primarily because of cgroup resource limits. A container might have a 512MB memory limit, but V8's default heap size could be 1.5GB. The process will be killed by the OOM killer when it exceeds the container's limit, even though V8 thinks it still has room. The fix is to set `--max-old-space-size` to about 75% of the container's memory limit. CPU limits can also cause issues — Node might detect multiple CPU cores but only have access to a fraction of one, affecting decisions about clustering.

---

## Section H: Predict the Behavior

### 36. What happens if your Node.js server runs this handler?

```typescript
app.get('/compute', (req, res) => {
  let sum = 0;
  for (let i = 0; i < 10_000_000_000; i++) {
    sum += i;
  }
  res.json({ sum });
});
```

Answer:

The event loop is blocked for the entire duration of the loop (likely several seconds). During that time, no other requests can be handled — all incoming connections queue up, health checks fail, and the server appears frozen. This is a classic event-loop-blocking CPU-bound operation. The response will eventually be sent, but every other client experiences extreme latency.

### 37. Two requests hit your server simultaneously. One calls `await db.query()` (takes 500ms). The other calls `res.json({ ok: true })`. What happens?

Answer:

Both requests are handled without issue. When the first request hits `await db.query()`, the handler pauses and the event loop is free. The second request's handler runs immediately and responds. When the database query completes 500ms later, the first handler resumes and sends its response. The I/O wait does not block the event loop.

### 38. Your Node process opens 1200 files simultaneously and the system's `ulimit -n` is 1024. What happens?

Answer:

After opening 1024 file descriptors, subsequent `open()` system calls fail with `EMFILE` (too many open files). In Node, this typically surfaces as an error in callbacks or rejected promises. If not handled, it can crash the process or cause cascading failures as file/socket operations start failing.

### 39. Your Docker container has a 256MB memory limit but your Node process uses `--max-old-space-size=512`. What happens?

Answer:

When the process's total memory usage (V8 heap + native allocations + stack + buffers) exceeds 256MB, the Linux OOM killer terminates the process. V8 thinks it has 512MB of heap available and won't trigger its own OOM error until then — but the container kills it first. The process exits with signal 9 (SIGKILL from OOM killer), which cannot be caught or handled gracefully.

---

## Section I: Production Diagnosis

### 40. Your server's response times suddenly increased from 50ms to 2000ms for all endpoints. CPU usage is at 95%. What do you investigate?

Answer:

High CPU + slow responses across all endpoints suggests something is blocking the event loop with CPU-bound work. I would: (1) check if any recently deployed code has a heavy computation in a request handler, (2) use `--prof` or a profiler to take a CPU profile and look for hot functions, (3) check if garbage collection is taking excessive time (`--trace-gc`), (4) check if a dependency update introduced a CPU-intensive operation. The fact that ALL endpoints are slow (not just one) is the key signal — it means the event loop itself is occupied.

### 41. Your server's response times increased to 2000ms, but CPU usage is only 5%. What do you investigate?

Answer:

Low CPU + slow responses strongly suggests I/O bottleneck — the server is waiting for something external. I would check: (1) database query performance — are queries slow? did indexes get dropped? (2) external API response times, (3) Redis connection issues, (4) DNS resolution delays (check if the libuv thread pool is saturated), (5) network latency between the server and its dependencies. The event loop is fine — it's just waiting for slow I/O.

### 42. Your Node.js process inside Kubernetes keeps getting OOM-killed every few hours. Memory grows steadily. What steps do you take?

Answer:

This is a classic memory leak. Steps: (1) take heap snapshots at intervals using `v8.writeHeapSnapshot()` or the inspector protocol, (2) compare snapshots to identify objects that grow over time, (3) check common leak sources — event listeners never removed, growing caches without eviction, closures capturing large objects, uncleared intervals/timeouts, (4) check if `--max-old-space-size` is set appropriately for the container limit, (5) use tools like `clinic.js` or Chrome DevTools to analyze heap growth patterns.

---

## Pass Gate

You pass Week 1 only if:

- You can explain what a process is, what it contains, and how it's created — without using vague language.
- You can draw the memory layout and explain stack vs heap.
- You can explain file descriptors and why they matter for servers.
- You can explain blocking I/O, non-blocking I/O, and I/O multiplexing — and why epoll is important.
- You can describe how the event loop works as a general pattern, then how Node.js specifically implements it.
- You can trace a request from TCP connection to response at the OS level.
- You can explain why CPU-bound work breaks the event loop and what alternatives exist.
- You can explain what containers actually are at the OS level.
- Your explanations are mechanism-level, not definition-level.
