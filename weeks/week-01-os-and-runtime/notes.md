# Week 1: How Computers Run Your Code

## Goal

Understand what actually happens underneath your backend code — from the operating system level up through the runtime. By the end of this week, you should be able to explain:

- what a process is and what it contains
- what threads, green threads, and coroutines are and how they differ
- how memory is laid out inside a process (stack, heap, data segments)
- what file descriptors are and why everything in Unix is a file
- what system calls are and why they matter
- the fundamental difference between blocking I/O, non-blocking I/O, and async I/O
- how I/O multiplexing works (select, poll, epoll, kqueue)
- how an event loop works from first principles — in general, not just Node
- how Node.js specifically implements its runtime (V8, libuv, thread pool)
- why Node is strong at I/O-bound work and weak at CPU-bound work — from the OS level
- what containers actually are at the OS level (namespaces, cgroups)

This is the foundation. Every topic in every later week sits on top of what you learn here. If you understand this week deeply, frameworks become transparent, performance problems become diagnosable, and architectural decisions become obvious.

---

## Part 1: What Is A Process?

When you run `node server.js`, the operating system creates a **process**.

A process is not your code. A process is a running instance of a program, managed by the operating system. Your code is just one thing inside it.

### What the OS actually creates

When a process starts, the OS allocates:

1. **A virtual address space** — a block of memory that the process thinks is its own private, contiguous memory. It is not. The OS uses virtual memory to create this illusion.

2. **At least one thread of execution** — the main thread. This is where your code actually runs, instruction by instruction.

3. **A process control block (PCB)** — kernel data structure that tracks everything about this process: its PID, state, CPU register values, memory maps, open file descriptors, signals, scheduling priority.

4. **File descriptor table** — a list of references to open files, sockets, pipes, and other I/O resources.

5. **Environment** — inherited environment variables, working directory, and the user/group IDs the process runs as.

### Process ID (PID)

Every process gets a unique integer identifier. When you run `ps aux | grep node`, the number in the second column is the PID.

Why this matters for backend engineering:

- Process managers (PM2, systemd) use PIDs to track, restart, and signal your service
- Logging systems use PIDs to correlate log entries from the same process
- When you run `kill 12345`, you are sending a signal to PID 12345

### Process creation: fork and exec

On Unix-like systems, new processes are created using two system calls:

**`fork()`** — creates a copy of the current process. The child process gets a copy of the parent's memory, file descriptors, and state. The child has a new PID. After fork, both parent and child continue executing from the same point, but they are now independent processes.

**`exec()`** — replaces the current process's code with a new program. The PID stays the same, but the memory is replaced with the new program's code and data.

The typical pattern is: fork first (create a new process), then exec (load new code into it).

When you type `node server.js` in a terminal:

1. Your shell process calls `fork()` to create a child process
2. The child calls `exec()` to replace itself with the Node.js binary
3. Node.js loads and begins executing `server.js`

### Signals

Signals are how the OS (or other processes) communicate with a running process.

Important signals for backend engineers:

| Signal | Number | Meaning |
|--------|--------|---------|
| `SIGTERM` | 15 | Polite shutdown request. "Please clean up and exit." |
| `SIGKILL` | 9 | Forced kill. Process cannot catch or ignore this. |
| `SIGINT` | 2 | Interrupt. What happens when you press Ctrl+C. |
| `SIGHUP` | 1 | Terminal disconnected. Often used to trigger config reload. |
| `SIGUSR1` | 10 | User-defined. Node.js uses this to start the debugger. |

Why this matters:

When Kubernetes sends your pod a shutdown signal, it sends `SIGTERM` first, waits a grace period, then sends `SIGKILL`. If your Node.js process does not handle `SIGTERM`, it dies immediately without draining active connections or finishing in-flight requests. This is why graceful shutdown matters — and you cannot understand it without understanding signals.

```typescript
// Graceful shutdown in Node.js
process.on('SIGTERM', async () => {
  console.log('SIGTERM received. Starting graceful shutdown...');
  
  // Stop accepting new connections
  server.close(() => {
    console.log('HTTP server closed.');
  });
  
  // Close database connections
  await db.disconnect();
  
  // Close Redis connections
  await redis.quit();
  
  console.log('Cleanup complete. Exiting.');
  process.exit(0);
});
```

### Process states

A process is always in one of these states:

- **Running** — currently executing on a CPU core
- **Ready** — waiting for CPU time (runnable but not currently scheduled)
- **Blocked/Waiting** — waiting for something (I/O, a signal, a child process)
- **Zombie** — finished executing but parent hasn't read its exit status yet
- **Stopped** — paused by a signal (like `SIGSTOP`)

This matters for performance debugging. When your Node process is "slow," is it:
- CPU-bound (spending all time in Running state)?
- I/O-bound (spending most time in Blocked state, waiting for DB/network)?
- Starved (stuck in Ready state because other processes hog the CPU)?

These are different problems with different solutions.

---

## Part 2: Threads vs Processes vs Green Threads vs Coroutines

This is one of the most confused areas in backend engineering. Let me be precise.

### Threads

A thread is a unit of execution within a process.

A process starts with one thread (the main thread). It can create additional threads. All threads within a process share:

- the same virtual address space (same heap memory)
- the same file descriptor table
- the same PID

But each thread has its own:

- stack (local variables, function call chain)
- program counter (where it is in the code)
- CPU register state

Why threads exist: they allow concurrent execution within a single process. If you have a multi-core CPU, different threads can run on different cores simultaneously — this is actual parallelism.

Why threads are dangerous: because they share memory. If two threads read and write the same variable without coordination, you get **race conditions** — bugs that are intermittent, timing-dependent, and notoriously hard to reproduce.

This is why thread-safe code requires synchronization primitives: mutexes, semaphores, atomic operations, read-write locks. These are concepts you will encounter in Go (goroutines + channels), Java (synchronized blocks), and Rust (ownership model that prevents data races at compile time).

### Processes vs Threads — the tradeoff

| Aspect | Separate Processes | Threads within one Process |
|--------|-------------------|---------------------------|
| Memory isolation | Full — each has own address space | None — share heap |
| Communication | IPC: pipes, sockets, shared memory | Direct memory access |
| Creation cost | Higher (copy address space) | Lower (share address space) |
| Crash isolation | One crash doesn't kill others | One crash can kill all threads |
| Parallelism | Yes, across cores | Yes, across cores |
| Complexity | Simpler (no shared state) | Harder (must manage shared state) |

In Node.js, the main choice is: one process with one main JS thread (default), or multiple processes using `cluster` module or PM2. Node chose single-threaded JavaScript to avoid the complexity of shared-memory concurrency in application code.

### Green threads (user-space threads)

Green threads are threads managed by the runtime, not the OS. The OS sees one thread; the runtime multiplexes many "virtual threads" on top of it.

Go's goroutines are the most famous example. When you write `go myFunction()`, the Go runtime creates a goroutine — a lightweight execution context that the Go scheduler maps onto a small pool of OS threads. Thousands of goroutines can run on a handful of OS threads.

Why green threads exist: OS threads are relatively expensive to create and switch between. Green threads are cheap (goroutines use ~2KB of stack vs ~1MB for OS threads). This matters when you need to handle tens of thousands of concurrent connections.

### Coroutines

Coroutines are functions that can pause their execution and resume later. They do not run concurrently by themselves — they cooperatively yield control.

JavaScript's `async/await` is a form of coroutine. When you `await` something, the function pauses and yields control back to the event loop. When the awaited operation completes, the function resumes.

The critical difference:

- **Threads (OS or green)**: the scheduler can preempt them — force them to yield
- **Coroutines**: they yield voluntarily at explicit points (`await`, `yield`)

This is why Node.js has a different class of concurrency bugs than Java. In Node, you don't get traditional race conditions from parallel memory access (because JavaScript is single-threaded). But you can get logical race conditions — situations where the order of async operations leads to unexpected state.

### Summary mental model

```
Parallelism (actual simultaneous execution):
├── Multi-process (separate memory, maximum isolation)
├── Multi-thread (shared memory, needs synchronization)
└── Green threads (runtime-scheduled, lightweight)

Concurrency without parallelism (interleaved execution):
├── Event loop + callbacks (Node.js model)
└── Coroutines / async-await (cooperative yielding)
```

### Interview angle

Question: "Does Node.js support parallelism?"

Weak answer: "No, it's single-threaded."

Strong answer: "JavaScript execution in Node is single-threaded — there is one main thread running your JS code, and it cannot execute two JS functions simultaneously. However, Node achieves high concurrency for I/O-bound work through its event loop, which allows it to handle thousands of connections without blocking. For CPU-bound parallelism, Node provides Worker Threads, which are actual OS threads with isolated memory (no shared heap by default — they communicate via message passing or SharedArrayBuffer). The libuv thread pool also provides a small number of OS threads for operations that don't have async OS-level APIs, like DNS lookups and some filesystem operations."

---

## Part 3: Memory Layout of a Process

When the OS creates a process, it sets up a virtual address space. This is the memory layout your program works within. Understanding it helps you reason about stack overflow errors, heap exhaustion, memory leaks, and buffer overflows.

### The four main regions

```
High addresses
┌─────────────────────┐
│       Stack         │ ← grows downward
│                     │
├─────────────────────┤
│         ↓           │
│                     │
│   (free space)      │
│                     │
│         ↑           │
├─────────────────────┤
│       Heap          │ ← grows upward
├─────────────────────┤
│   BSS (uninitialized│
│   global data)      │
├─────────────────────┤
│   Data (initialized │
│   global data)      │
├─────────────────────┤
│   Text (code)       │ ← your program's machine instructions
└─────────────────────┘
Low addresses
```

### Stack

The stack stores:
- local variables
- function arguments
- return addresses (where to go back after a function returns)

The stack is LIFO (last in, first out). When you call a function, a **stack frame** is pushed. When the function returns, it is popped.

The stack has a fixed maximum size (usually 1-8 MB per thread). If you exceed it — usually through deep recursion — you get a **stack overflow**.

```typescript
// This will eventually crash with a stack overflow
function infinite(): void {
  infinite(); // each call adds a frame, stack never shrinks
}
```

Stack allocation is extremely fast — just moving a pointer. This is why local variables are cheap.

### Heap

The heap stores:
- dynamically allocated objects
- data whose size is not known at compile time
- data that needs to outlive the function that created it

In JavaScript, almost everything lives on the heap: objects, arrays, strings, closures. The V8 engine manages the JS heap and runs garbage collection to reclaim unused objects.

Heap allocation is slower than stack allocation because the runtime must find a suitable block of free memory. Garbage collection adds periodic pauses (though V8's GC is highly optimized and mostly incremental).

### Why this matters for backend engineers

1. **Memory leaks**: When objects on the heap are referenced but never used again, the garbage collector cannot reclaim them. Common Node.js leaks: growing arrays, unclosed event listeners, unbounded caches, closures capturing large objects.

2. **V8 heap limits**: Node.js has a default heap limit (around 1.5-2 GB on 64-bit systems). You can increase it with `--max-old-space-size=4096`, but if your process keeps growing, you have a leak — more memory is not the fix.

3. **Buffer and TypedArray**: Node.js `Buffer` objects can be allocated outside the V8 heap (in native memory). This is important for high-throughput servers processing lots of binary data — the V8 GC doesn't track this memory.

---

## Part 4: File Descriptors — Why Everything Is A File

In Unix, almost every I/O resource is represented as a **file descriptor** (FD) — a small non-negative integer that the kernel uses to identify an open I/O channel.

When a process opens a file, a socket, a pipe, or a device, the kernel assigns it a file descriptor. The process then uses that integer to read from, write to, or close the resource.

### Standard file descriptors

Every process starts with three:

| FD | Name | Purpose |
|----|------|---------|
| 0 | stdin | Standard input |
| 1 | stdout | Standard output |
| 2 | stderr | Standard error |

When you write `console.log("hello")`, Node.js writes to FD 1.  
When you write `console.error("fail")`, Node.js writes to FD 2.

### Network sockets are file descriptors

When your Express server calls `server.listen(3000)`, the OS creates a **socket** — a communication endpoint — and assigns it a file descriptor. When a client connects, the OS creates another file descriptor for that specific connection.

This is why "too many open files" (`EMFILE` error) crashes Node servers under high load — you've exhausted the per-process file descriptor limit. The default is often 1024. Production servers raise it with `ulimit -n 65535` or equivalent.

### Why this design matters

Because everything is a file descriptor, the OS can use the same interface for all I/O. The `read()` system call works on files, sockets, pipes, and devices. The `write()` system call works on all of them too. And most importantly, I/O multiplexing mechanisms (epoll, kqueue) can watch all of them simultaneously.

This uniformity is the foundation of event-driven servers.

---

## Part 5: System Calls — The Boundary Between Your Code and the Kernel

Your code cannot directly access hardware, network interfaces, or the filesystem. It runs in **user space**. The kernel runs in **kernel space** and controls all hardware.

To do anything involving I/O, your code must ask the kernel through a **system call** (syscall).

### What happens during a system call

1. Your code calls a library function (e.g., `fs.readFile()` in Node, which eventually calls libuv, which calls the C library)
2. The C library executes a special CPU instruction that switches from user mode to kernel mode
3. The kernel performs the operation (reads the file, sends network data, etc.)
4. The kernel switches back to user mode and returns the result

This mode switch has a cost. It's not expensive for individual calls, but doing millions of syscalls per second adds up. This is one reason why buffered I/O (reading/writing in chunks) outperforms byte-at-a-time I/O.

### Common system calls backend engineers should know about

| Syscall | Purpose | When your backend code triggers it |
|---------|---------|-----------------------------------|
| `read()` | Read data from a file descriptor | Reading a file, receiving network data |
| `write()` | Write data to a file descriptor | Writing a file, sending a response |
| `open()` | Open a file, get a file descriptor | Opening a log file, config file |
| `close()` | Close a file descriptor | Closing a connection, closing a file |
| `socket()` | Create a network socket | Starting a server, connecting to a database |
| `bind()` | Bind a socket to an address and port | `server.listen(3000)` |
| `listen()` | Mark socket as accepting connections | `server.listen(3000)` |
| `accept()` | Accept an incoming connection | Each new client connection |
| `connect()` | Connect to a remote socket | Connecting to a database or API |
| `epoll_create()` | Create an epoll instance | Node.js startup (via libuv) |
| `epoll_wait()` | Wait for I/O events on watched FDs | The event loop waiting for activity |
| `fork()` | Create a child process | `child_process.fork()`, cluster module |
| `mmap()` | Map file into memory | Some file I/O optimizations |

### Why this matters

When someone says "Node.js uses non-blocking I/O," what they mean at the OS level is: Node.js makes system calls that return immediately instead of waiting for the operation to complete. It then uses `epoll_wait()` (on Linux) to be notified when results are ready.

Understanding system calls turns vague statements like "non-blocking" into concrete mechanisms.

---

## Part 6: Blocking I/O vs Non-Blocking I/O vs Async I/O

This is the most important section of Week 1. If you understand this deeply, you understand why Node.js exists the way it does, and you understand the foundation of every high-performance server.

### Blocking I/O

When a process makes a blocking I/O call (e.g., `read()` on a socket), the calling thread stops executing and waits until data is available.

```
Thread:  [running] → [blocked waiting for data] → [data arrives] → [running again]
```

During the blocked period, that thread does nothing useful. If you have one thread per connection (the traditional Java/C model), you need one thread for every concurrent connection. 10,000 connections = 10,000 threads. Each thread uses ~1MB of stack memory. That's 10GB of memory just for stacks.

This is the **thread-per-connection model**. It works, but it scales expensively.

### Non-blocking I/O

With non-blocking I/O, the `read()` system call returns immediately — either with data (if available) or with an indication that no data is ready yet (typically `EAGAIN` or `EWOULDBLOCK` error code).

```
Thread:  [calls read()] → [returns immediately: no data yet] → [does other work] → [calls read() again] → [data available!]
```

This is better because the thread is not stuck. But naively polling in a loop ("busy waiting") wastes CPU cycles checking over and over.

### I/O Multiplexing — the real solution

I/O multiplexing lets a single thread watch multiple file descriptors simultaneously and be notified when any of them are ready for I/O.

The evolution on Linux:

**`select()` (1983)**: Watch up to FD_SETSIZE (usually 1024) file descriptors. On each call, pass the entire set. The kernel scans all of them. O(n) per call.

**`poll()` (1986)**: No hard limit on number of FDs. Still O(n) per call because the kernel scans the entire list.

**`epoll()` (Linux 2.6, 2002)**: Register interest in FDs once. The kernel maintains the watch list internally. `epoll_wait()` returns only the FDs that are ready — O(1) for each ready FD. This is what makes Linux servers handle millions of connections.

**`kqueue()` (BSD/macOS)**: Similar to epoll, BSD's equivalent. Also O(1) for ready events.

**`io_uring` (Linux 5.1, 2019)**: The newest and most advanced. Allows truly asynchronous I/O with a shared ring buffer between user space and kernel space, minimizing system call overhead. Not yet widely used in Node.js but represents the future.

### How epoll works (simplified)

```
1. Process creates an epoll instance: epoll_create()
2. Process registers file descriptors to watch: epoll_ctl(ADD, fd, events)
3. Process calls epoll_wait() — blocks until at least one FD is ready
4. Kernel returns the list of ready FDs
5. Process handles the ready FDs
6. Go back to step 3
```

This is exactly what an event loop does. The event loop is not magic — it is a loop around `epoll_wait()` (or `kqueue()` on macOS).

### Async I/O (true async)

True async I/O (like `io_uring` or Windows IOCP) goes one step further: the kernel performs the I/O operation and notifies the process when it's complete. The process never needs to do the actual read/write — the kernel does it and delivers the result.

Most "async" in Node.js is actually I/O multiplexing with non-blocking sockets, not true async I/O. The distinction matters for very high-performance systems, but for most backend work, the practical effect is similar.

### The mental model

```
Blocking I/O:      "Call and wait. Thread does nothing until data arrives."
Non-blocking I/O:  "Call and check. Returns immediately. You poll for readiness."
I/O multiplexing:  "Register interest. Wait efficiently. Handle only ready FDs."
True async I/O:    "Submit request. Kernel does the work. Get notified when done."
```

### Production reality

Almost every high-performance backend system — whether written in Node.js, Go, Nginx, or Redis — uses I/O multiplexing under the hood. The specific mechanism varies by OS, but the concept is identical: one (or few) threads watching many connections simultaneously, only doing work when there's something to do.

This is why Nginx (using epoll) can handle 100,000+ concurrent connections with a handful of worker processes. This is why Node.js can handle thousands of concurrent requests with a single JavaScript thread.

---

## Part 7: The Event Loop — From First Principles

An event loop is not a Node.js concept. It is a general programming pattern used by any system that needs to handle many concurrent I/O operations on a small number of threads.

### The simplest possible event loop

```
while (true) {
  events = wait_for_events()    // epoll_wait(), kqueue(), etc.
  for each event in events {
    handle(event)               // run the callback/handler for this event
  }
}
```

That's it. That's the core idea. Everything else is optimization and scheduling detail built on top of this.

### Why it works

Because I/O-bound servers spend most of their time waiting. If you're handling 10,000 connections, at any given moment maybe 50 have data ready to process. The event loop lets you:

1. Wait efficiently for any of those 10,000 FDs to become ready (one `epoll_wait()` call)
2. Process only the 50 that are ready
3. Go back to waiting

No 10,000 threads. No 10GB of stack memory. Just one thread doing useful work whenever work is available.

### When the event loop breaks down

The event loop model works brilliantly for I/O-bound work. It fails for CPU-bound work.

If one event handler does CPU-intensive work (e.g., a tight loop for 5 seconds), the event loop is blocked for that entire duration. No other events are processed. All other connections stall.

This is not a bug in the event loop model — it is a fundamental characteristic. The event loop assumes that each handler runs quickly (microseconds to low milliseconds) and returns control. If a handler violates that assumption, the whole system suffers.

This is the single most important thing to understand about Node.js performance.

### CPU-bound vs I/O-bound — the decision that shapes everything

**I/O-bound work**: time is spent waiting for external systems. Database queries, network calls, file reads. The CPU is mostly idle. The event loop handles this perfectly.

**CPU-bound work**: time is spent computing. Image processing, encryption, heavy JSON parsing, complex calculations. The CPU is maxed out. The event loop cannot help — in fact, it makes things worse because one handler blocks everything else.

Solutions for CPU-bound work in an event-loop architecture:

1. **Worker threads** — run the heavy computation on a separate OS thread
2. **Child processes** — fork a separate process for the computation
3. **External services** — offload to a specialized service (e.g., image processing microservice)
4. **Queue + workers** — push the work to a queue and let dedicated worker processes handle it

### Event loops in other systems

| System | Event loop mechanism | Notes |
|--------|---------------------|-------|
| Node.js | libuv (uses epoll/kqueue) | Single JS thread + thread pool for blocking ops |
| Nginx | Custom event loop (epoll/kqueue) | Multiple worker processes, each with an event loop |
| Redis | Custom event loop (ae library, uses epoll) | Single-threaded, extremely fast for in-memory ops |
| Go | Runtime scheduler (not a traditional event loop) | Goroutines multiplexed on OS threads, uses netpoll |
| Python asyncio | asyncio event loop (uses selectors, epoll/kqueue) | Single-threaded like Node |
| Rust (Tokio) | mio library (epoll/kqueue) + task scheduler | Multi-threaded async runtime |

Understanding that the event loop is a general pattern — not a Node.js quirk — helps you reason about performance in any backend system.

---

## Part 8: How Node.js Implements Its Runtime

Now that you understand the general concepts, let's see how Node.js puts them together.

### The components

Node.js is built from several pieces:

**V8** — Google's JavaScript engine. Compiles JavaScript to machine code. Manages the JS heap and garbage collection. V8 is single-threaded for JS execution — it runs one JS function at a time.

**libuv** — A cross-platform async I/O library written in C. Provides:
- The event loop
- Async TCP/UDP sockets (using epoll/kqueue/IOCP)
- Async DNS resolution
- File system operations
- Thread pool for operations that don't have async OS APIs
- Child process management
- Signal handling
- Timers

**Node.js bindings** — C++ code that connects V8 (JavaScript world) to libuv (OS world). When you call `fs.readFile()` in JavaScript, the bindings translate that into libuv operations.

**Node.js standard library** — JavaScript code built on top of the bindings. The `http`, `fs`, `net`, `crypto` modules you use.

### The libuv event loop phases

The libuv event loop is not a simple "wait for events, handle events" loop. It has specific phases:

```
   ┌───────────────────────────┐
┌─>│         timers             │ ← setTimeout, setInterval callbacks
│  └──────────┬────────────────┘
│  ┌──────────┴────────────────┐
│  │     pending callbacks      │ ← I/O callbacks deferred from previous loop
│  └──────────┬────────────────┘
│  ┌──────────┴────────────────┐
│  │       idle, prepare        │ ← internal use only
│  └──────────┬────────────────┘
│  ┌──────────┴────────────────┐
│  │          poll              │ ← retrieve new I/O events; execute I/O callbacks
│  └──────────┬────────────────┘  (this is where most of the time is spent)
│  ┌──────────┴────────────────┐
│  │          check             │ ← setImmediate callbacks
│  └──────────┬────────────────┘
│  ┌──────────┴────────────────┐
│  │     close callbacks        │ ← socket.on('close'), etc.
│  └──────────┬────────────────┘
└─────────────┘
```

Between each phase, Node processes **microtasks**:
- `process.nextTick()` callbacks (highest priority)
- Promise `.then()` / `await` continuations

### The thread pool

Some operations don't have async OS-level APIs:
- File system operations (on Linux, most FS ops are blocking at the kernel level)
- DNS lookups (`dns.lookup()` uses `getaddrinfo()` which is blocking)
- Some crypto operations
- Zlib compression

For these, libuv uses a thread pool (default size: 4 threads, configurable via `UV_THREADPOOL_SIZE`).

When you call `fs.readFile()`:
1. libuv posts the work to the thread pool
2. A worker thread performs the blocking `read()` syscall
3. When complete, the worker thread queues the callback
4. The event loop picks up the callback in the next iteration

This is why file operations in Node are "async" even though the underlying OS calls are blocking — libuv hides the blocking behind its thread pool.

Important: the thread pool is small. If you do many concurrent file operations or DNS lookups, they queue up waiting for a thread. This can become a bottleneck. Increase `UV_THREADPOOL_SIZE` if needed (max 1024).

### Network I/O does not use the thread pool

TCP and UDP sockets use epoll/kqueue directly — they are truly non-blocking at the OS level. This is why Node handles network I/O so efficiently: no thread pool bottleneck, just the event loop and epoll.

```
Network I/O:  JS → libuv → epoll/kqueue → OS kernel (no thread pool)
File I/O:     JS → libuv → thread pool → blocking syscall → OS kernel
DNS:          JS → libuv → thread pool → getaddrinfo → OS resolver
Crypto:       JS → libuv → thread pool → OpenSSL
```

### What happens when a request hits your Express server

Let's trace it at the OS level:

1. Your server is running. The libuv event loop is sitting in `epoll_wait()`, watching the server socket's file descriptor.

2. A client connects. The OS completes the TCP handshake and makes the connection FD readable.

3. `epoll_wait()` returns, reporting the server socket has a pending connection.

4. libuv calls `accept()` to get the new connection's file descriptor.

5. libuv registers the new FD with epoll for read events.

6. The client sends HTTP data. The connection FD becomes readable.

7. `epoll_wait()` returns again. libuv reads the data with `read()`.

8. The raw bytes travel through Node's HTTP parser (llhttp) which fires JavaScript callbacks.

9. Express routes the parsed request to your handler function.

10. Your handler runs JavaScript on the V8 main thread.

11. If your handler does `await db.query(...)`:
    - The database client sends data through a socket (non-blocking, via epoll)
    - Your handler is suspended (the async function pauses at `await`)
    - The event loop continues processing other events
    - When the database response arrives, the socket becomes readable
    - epoll reports it, libuv reads the data
    - The promise resolves, your handler resumes
    - You call `res.json(...)`, which calls `write()` on the connection FD

12. The response bytes travel to the client.

That is the complete lifecycle. Every backend framework — Express, Fastify, Koa, Hapi — is built on top of this same mechanism.

---

## Part 9: V8 Internals That Matter For Backend Engineers

You don't need to know V8 at the compiler level, but you need to understand a few things that directly affect your server's performance and stability.

### Garbage collection

V8 uses a generational garbage collector:

**Young generation (Scavenger)**: New objects are allocated here. This space is small (~1-8 MB) and collected frequently. Collection is fast (usually <1ms) because most objects die young — they're temporary variables, intermediate values, request/response objects.

**Old generation (Mark-Sweep / Mark-Compact)**: Objects that survive several young-generation collections are promoted here. This space is larger (up to the `--max-old-space-size` limit). Collection is less frequent but more expensive.

Why this matters:

- Frequent, short GC pauses are normal and usually invisible
- Occasional longer pauses happen during old-generation collection — this can cause latency spikes
- Memory leaks manifest as old-generation growth: objects keep getting promoted but never collected
- You can monitor GC behavior with `--trace-gc` or the `perf_hooks` module

### Hidden classes and inline caching

V8 optimizes property access by creating hidden classes (called "maps" internally) for objects with the same shape. When you create many objects with the same properties in the same order, V8 can optimize property access to be nearly as fast as struct access in C.

This has a practical implication: objects with consistent shapes perform better than objects with dynamic properties added in random order. This is another reason TypeScript interfaces are good — they encourage consistent object shapes.

### The heap limit

By default, Node.js limits V8's heap to approximately 1.5-2 GB (64-bit systems). This is a deliberate limit, not a hardware limitation. You can change it:

```bash
node --max-old-space-size=4096 server.js  # 4GB heap limit
```

But if your process consistently approaches the limit, increasing it is a band-aid. Find and fix the leak.

---

## Part 10: What Containers Actually Are

Containers (Docker) are not virtual machines. They are processes with enhanced isolation, using Linux kernel features.

### Namespaces

Linux namespaces give a process its own isolated view of system resources:

| Namespace | What it isolates |
|-----------|-----------------|
| PID | Process IDs — the container sees PID 1 for its main process |
| Network | Network interfaces, IP addresses, ports, routing tables |
| Mount | Filesystem mount points — the container sees its own filesystem tree |
| UTS | Hostname and domain name |
| IPC | Inter-process communication resources |
| User | User and group IDs |
| Cgroup | Cgroup root directory |

Your containerized Node.js process is still a regular Linux process. It just cannot see other processes, other network interfaces, or other parts of the filesystem.

### Cgroups

Control groups limit how much of a system resource a process can use:

- **Memory limit**: "This container can use at most 512MB of RAM." If it exceeds this, the kernel kills it (OOM killer).
- **CPU limit**: "This container gets at most 0.5 CPU cores worth of time."
- **I/O limits**: throttle disk read/write bandwidth.

This is why your Node.js process inside a container might behave differently than outside: it has resource limits. V8's default heap size might be too large for the container's memory limit, causing OOM kills.

Best practice: Set `--max-old-space-size` to about 75% of the container's memory limit. Leave room for the V8 overhead, libuv, native modules, and the stack.

### Layers and images

A Docker image is a layered filesystem. Each layer is a set of filesystem changes (files added, modified, or deleted). Layers are read-only and shared between containers.

When a container starts, Docker adds a thin writable layer on top. This is the container's runtime filesystem. When the container stops, this writable layer is discarded (unless you use volumes).

This layering system is why Docker images are efficient to store and transfer — shared base layers are downloaded once.

### Why this matters for backend engineers

1. **Your process is just a process.** Debug it the same way — check logs, check resource usage, check FDs.
2. **Resource limits are real.** Know your container's memory and CPU limits. Set Node.js flags accordingly.
3. **Networking is virtualized.** The container has its own network namespace. Port mapping (`-p 3000:3000`) connects the host's port to the container's port.
4. **Filesystem is ephemeral.** Don't write important data to the container filesystem. Use volumes or external storage.
5. **Signals still matter.** Docker sends `SIGTERM` when stopping a container. Your graceful shutdown code matters just as much inside a container.

---

## Part 11: Putting It All Together — The Complete Mental Model

When you run a backend service, here is what is actually happening:

```
┌─────────────────────────────────────────────────────────────────┐
│                        Operating System                         │
│                                                                 │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                Your Node.js Process                        │ │
│  │                                                            │ │
│  │  ┌──────────────────────────────────────────────────────┐  │ │
│  │  │                    V8 Engine                          │  │ │
│  │  │                                                      │  │ │
│  │  │  ┌─────────────┐  ┌──────────────┐  ┌────────────┐  │  │ │
│  │  │  │  Call Stack  │  │  Heap (GC'd) │  │  Compiler  │  │  │ │
│  │  │  │  (your JS    │  │  (objects,   │  │  (JIT)     │  │  │ │
│  │  │  │   execution) │  │   closures)  │  │            │  │  │ │
│  │  │  └─────────────┘  └──────────────┘  └────────────┘  │  │ │
│  │  └──────────────────────────────────────────────────────┘  │ │
│  │                                                            │ │
│  │  ┌──────────────────────────────────────────────────────┐  │ │
│  │  │                     libuv                             │  │ │
│  │  │                                                      │  │ │
│  │  │  ┌────────────┐  ┌───────────────┐  ┌────────────┐  │  │ │
│  │  │  │ Event Loop  │  │  Thread Pool  │  │  Timers    │  │  │ │
│  │  │  │ (epoll/     │  │  (FS, DNS,    │  │            │  │  │ │
│  │  │  │  kqueue)    │  │   crypto)     │  │            │  │  │ │
│  │  │  └────────────┘  └───────────────┘  └────────────┘  │  │ │
│  │  └──────────────────────────────────────────────────────┘  │ │
│  │                                                            │ │
│  │  ┌──────────────────────────────────────────────────────┐  │ │
│  │  │              File Descriptors                         │  │ │
│  │  │  FD 0: stdin                                         │  │ │
│  │  │  FD 1: stdout                                        │  │ │
│  │  │  FD 2: stderr                                        │  │ │
│  │  │  FD 3: server socket (listening on :3000)            │  │ │
│  │  │  FD 4: client connection #1                          │  │ │
│  │  │  FD 5: database connection                           │  │ │
│  │  │  FD 6: Redis connection                              │  │ │
│  │  │  ...                                                 │  │ │
│  │  └──────────────────────────────────────────────────────┘  │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                 │
│  Kernel: scheduling, memory management, network stack, FS       │
└─────────────────────────────────────────────────────────────────┘
```

Everything in this diagram is real. When you understand each piece, backend engineering stops being mysterious.

---

## Part 12: Common Misconceptions

### "Node.js is single-threaded"

Partially true. JavaScript execution is single-threaded. But the Node.js process has multiple threads:
- Main thread (V8 + event loop)
- libuv thread pool threads (default 4)
- V8 helper threads (GC, compilation)
- Worker threads if you create them

### "Async means parallel"

No. In Node.js, async means "deferred execution on the same thread." When you `await db.query()`, the query runs on the database server (different machine or process). Your JS thread is not running the query — it's free to do other work while waiting for the response.

### "The event loop runs your JavaScript"

V8 runs your JavaScript. The event loop decides WHEN to run it — specifically, which callback or promise continuation to execute next.

### "Non-blocking I/O means instant responses"

Non-blocking I/O means the thread does not wait for I/O. The I/O still takes time. A database query still takes 50ms. But during those 50ms, the thread can handle other requests.

### "More threads = more performance"

Only for CPU-bound work. For I/O-bound work, more threads often means more memory usage and more context-switching overhead for minimal throughput gain. This is exactly why the event loop model works well for API servers — they are I/O-bound.

### "Docker is a lightweight VM"

A VM runs a full operating system with its own kernel. A container shares the host kernel and uses namespaces/cgroups for isolation. Containers start faster, use less memory, and have less overhead than VMs, but they provide less isolation.

---

## Part 13: Interview Questions You Should Be Ready For

After completing this week, you should be able to answer these cleanly:

1. What happens at the OS level when you run `node server.js`?
2. What is the difference between a process and a thread?
3. Why does Node.js use a single-threaded event loop instead of multi-threading?
4. What is epoll and why does it matter for server performance?
5. What is a file descriptor?
6. Why would a Node.js server get an `EMFILE` error?
7. What is the difference between blocking I/O and non-blocking I/O?
8. What does libuv's thread pool do and when is it used?
9. How does V8's garbage collector affect backend latency?
10. What is the difference between a container and a virtual machine?
11. Why does CPU-heavy code break the event loop model?
12. How would you handle CPU-intensive work in a Node.js application?
13. What happens between the phases of the libuv event loop?
14. Why is `process.nextTick()` higher priority than promise microtasks?
15. What is the practical effect of container memory limits on a Node.js process?

---

## First-Principles Rules To Keep

1. A process is a running program managed by the OS — it has memory, threads, file descriptors, and a PID.
2. Threads share memory; processes do not. Shared memory creates concurrency hazards.
3. Everything in Unix is a file descriptor — files, sockets, pipes. The FD limit matters.
4. System calls are the boundary between your code and the kernel. I/O requires syscalls.
5. Blocking I/O wastes thread time. Non-blocking I/O with multiplexing (epoll) is how high-performance servers work.
6. An event loop is just a loop around "wait for events, handle events." It is not Node-specific.
7. Node.js = V8 (JS engine) + libuv (async I/O) + bindings + standard library.
8. Network I/O uses epoll directly. File I/O uses the libuv thread pool. Know the difference.
9. CPU-bound work blocks the event loop. Move it to worker threads, child processes, or external services.
10. Containers are processes with namespace isolation and cgroup resource limits, not virtual machines.
11. Understanding the OS level makes framework behavior predictable, performance problems diagnosable, and architectural decisions obvious.
