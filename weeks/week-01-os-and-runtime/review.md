# Week 1 Review

Status: reviewed

## Review Template

### Concept Review

- Process model (fork, exec, PID, signals): **strong** — answers demonstrate OS-level understanding, not just API knowledge
- Threads vs processes vs green threads vs coroutines: covered in notes, not directly tested in exercises
- Memory layout (stack vs heap): covered in notes, not directly tested in exercises
- File descriptors: **strong** — FD investigation exercise and answers are precise
- System calls: **strong** — correctly identified socket/bind/listen for the TCP server
- Blocking I/O vs non-blocking I/O vs I/O multiplexing: **strong** — blocking vs waiting exercise demonstrates clear understanding
- epoll/kqueue understanding: **solid** — referenced correctly in multiple answers
- Event loop (general, not just Node): **solid** — phase ordering mostly correct, see correction below
- Node.js runtime (V8, libuv, thread pool): **strong** — thread pool answers are precise and practical
- CPU-bound vs I/O-bound distinction: **strong** — Exercise 2 demonstrates this perfectly
- Container fundamentals (namespaces, cgroups): skipped (Exercise 7)

### Practical Review

- TCP server exercise: **pass** — clean code, handles errors, multi-client works, good answers
- Blocking vs waiting demonstration: **pass** — correct implementation, strong explanations
- File descriptor investigation: **pass** — good observation about VS Code terminal inheriting higher limits
- Graceful shutdown implementation: **pass with notes** — see issues below
- Thread pool saturation experiment: **pass** — correct but didn't test with different UV_THREADPOOL_SIZE values
- Event loop phases prediction accuracy: **mostly correct** — see nextTick correction below
- Explanation quality: **strong** — mechanism-level throughout, not memorized phrases

### Issues Found

#### 1. Exercise 4: Typo in signal handler
Line 12: `"SOGTERM received"` should be `"SIGTERM received"`.

#### 2. Exercise 4: Graceful shutdown has a race condition
The current implementation uses a fixed 5-second timeout to exit, but `server.close()` is async. If all connections drain before 5s, you wait unnecessarily. If connections take longer than 5s, you force-exit before they complete. Better pattern:

```javascript
server.close(() => {
  console.log("All connections drained. Graceful shutdown complete.");
  process.exit(0);
});

// Force exit if drain takes too long
setTimeout(() => {
  console.error("Could not drain connections in time. Forcing exit.");
  process.exit(1);
}, 10000);
```

The `server.close()` callback fires when ALL existing connections are done. The timeout is a safety net, not the primary exit mechanism.

#### 3. Exercise 4: Duplicated signal handlers
The SIGTERM and SIGINT handlers are identical. Extract to a function:

```javascript
function gracefulShutdown(signal) {
  console.log(`${signal} received. Starting graceful shutdown...`);
  server.close(() => {
    console.log("Graceful shutdown complete.");
    process.exit(0);
  });
  setTimeout(() => {
    console.error("Forced exit after timeout.");
    process.exit(1);
  }, 10000);
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
```

#### 4. Exercise 5: Missing the comparison test
The exercise asked to run with `UV_THREADPOOL_SIZE=4` (default) AND `UV_THREADPOOL_SIZE=16` and compare timing. Only the default was tested. The comparison is the point — it proves the thread pool is the bottleneck.

#### 5. Exercise 6: nextTick vs Promise ordering — CORRECTION NEEDED

Your Exercise 6 answers state:

> "In newer Node.js versions (v11+), promises have higher priority than process.nextTick and run first."

**This is incorrect.** I just verified on your exact Node version (v22.22.2):

```
node -e "process.nextTick(() => console.log('nextTick')); Promise.resolve().then(() => console.log('promise'));"
```

Output: `nextTick` then `promise`.

**The actual order on Node v22 is still: nextTick → promise microtasks → timers.**

What changed in Node v11+ was something different: before v11, microtasks (both nextTick and promises) were only processed at certain points. After v11, microtasks are processed between **every phase** of the event loop (aligning with browser behavior). But within microtask processing, **nextTick still runs before promises.** This hasn't changed.

What likely confused you: when you ran Exercise 6, the interleaving of nextTick and promises gets complex with nesting. Here's the exact behavior:

```
Sync completes →
  Drain ALL nextTick queue → [nextTick 1, nextTick 2]
  Drain ALL promise queue → [promise 1, promise 2]
  (promise 2 scheduled a nextTick inside it)
  Drain nextTick again → [nested nextTick, nextTick inside promise]
  ... then phases continue
```

The key: nextTick and promise queues alternate when one schedules into the other, but at any given drain point, nextTick always goes first.

### Decision

- Pass: **yes, with conditions**
- Conditions: (1) fix the nextTick understanding, (2) re-run Exercise 5 with different UV_THREADPOOL_SIZE values

### Notes

- Strong first week. The answers show genuine first-principles understanding, not memorized definitions.
- The VS Code FD limit observation in Exercise 3 was a great catch — shows real investigative thinking.
- The "CPU-heavy detection" answer in Exercise 2 was practical and production-relevant.
- Exercise 7 (Docker/containers) skipped — acceptable for now, will be covered in Week 9.
- Code is clean JavaScript (not TypeScript as originally suggested, but that's fine — the concepts are language-agnostic).
