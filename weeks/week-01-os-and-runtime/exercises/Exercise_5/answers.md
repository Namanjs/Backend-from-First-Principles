# Exercise 5: libuv Thread Pool Bottleneck — Reflection Questions

---

**Q1. Why does `fs.readFile()` use the thread pool instead of epoll?**

File I/O does not have async OS-level APIs the way network I/O does. The underlying OS calls for reading files are blocking — they sit and wait until the data is ready. To avoid blocking the main thread, libuv offloads these blocking calls to its thread pool, where they can block a worker thread without freezing the event loop.

---

**Q2. What other operations use the thread pool?**

- File I/O (`fs.readFile`, `fs.writeFile`, etc.)
- DNS resolution (`dns.lookup`)
- Crypto operations (`crypto.pbkdf2`, `crypto.randomBytes`)
- Compression (`zlib`)

---

**Q3. Why is the default thread pool size only 4?**

Threads have a real cost — each one consumes memory (stack space) and adds CPU scheduling overhead. 4 is a conservative default that works well for most applications without wasting resources. It is not just convention — it is a deliberate tradeoff between concurrency and resource consumption. The hard ceiling of 1024 is a libuv limit, not something you would realistically hit.

---

**Q4. In what scenarios would you increase `UV_THREADPOOL_SIZE` in production?**

When there are a large number of concurrent I/O operations and the limited thread pool is causing a visible bottleneck in throughput. A common real-world case is running CPU-heavy crypto operations (like `bcrypt` hashing on every login request) alongside file I/O — they compete for the same 4 threads, creating a queue. Increasing the pool size in these scenarios reduces wait time.

---

**Q5. Why doesn't network I/O (like HTTP requests) use the thread pool?**

Network I/O has async OS-level APIs — epoll on Linux, kqueue on macOS. libuv registers the network socket with epoll and gets notified when data is ready. No thread needs to sit and wait, so no thread pool is needed. This is why Node can handle thousands of concurrent network connections efficiently on a single thread.