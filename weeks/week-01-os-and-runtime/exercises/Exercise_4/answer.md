# Exercise 4: Graceful Shutdown — Reflection Questions

---

**Q1. What is the difference between `SIGTERM` and `SIGKILL`?**

`SIGTERM` is a signal asking the process to shut down gracefully — stop accepting new requests, complete pending in-flight requests, and then close the server cleanly. `SIGKILL` closes the process forcefully with no graceful shutdown and no time to execute pending callbacks.

---

**Q2. Why can't you handle `SIGKILL`?**

Because `SIGKILL` is handled entirely by the OS kernel, not by the process itself. The signal never even reaches your process — the kernel terminates it directly. There is no opportunity for your code to intercept it, which is fundamentally different from `SIGTERM` which your process receives and can choose to handle.

---

**Q3. What happens in Kubernetes when a pod is terminated? What signal is sent first?**

Kubernetes sends `SIGTERM` first, giving the process a grace period (default 30 seconds) to shut down gracefully — stop receiving requests, complete in-flight work, and exit cleanly. If the process is still running after the grace period, Kubernetes sends `SIGKILL` to force terminate it.

---

**Q4. Why does `server.close()` not immediately kill existing connections?**

`server.close()` stops the server from accepting new connections immediately by closing the listening socket, but it lets existing connections finish naturally. It waits until the last open connection closes before firing its callback. This is intentional — the goal is graceful shutdown, not abrupt termination of in-flight requests.

---

**Q5. What happens if you don't handle `SIGTERM` and the process receives it?**

Node's default behavior is to terminate the process immediately — effectively the same as `SIGKILL`. No graceful shutdown, no in-flight requests completed, just an abrupt stop. `SIGKILL` does not automatically follow `SIGTERM` — that pattern only exists in environments like Kubernetes that explicitly implement it. In a plain `kill <pid>` scenario, an unhandled `SIGTERM` alone kills the process immediately.