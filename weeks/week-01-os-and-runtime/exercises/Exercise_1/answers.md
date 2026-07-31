# Exercise 1: Raw TCP Server — Reflection Questions

---

**Q1. What system calls does `net.createServer()` and `server.listen(4000)` ultimately trigger?**

`net.createServer()` itself triggers no system calls — it simply creates a JavaScript object. The system calls happen when `server.listen(4000)` is called:

- `socket()` — creates a network socket and returns a file descriptor
- `bind()` — attaches that socket to port 4000
- `listen()` — tells the OS to begin queuing incoming connections

Once listening, Node registers the server's fd with epoll. When a new connection arrives, the OS notifies the event loop, which calls your `createServer` callback with a new socket object for that client.

---

**Q2. How many file descriptors does your server have open with 3 clients connected?**

4 — one for the server's listening socket, and one per client connection:

- fd 1: server socket (listening on port 4000)
- fd 2: client 1's socket
- fd 3: client 2's socket
- fd 4: client 3's socket

Every TCP connection is represented as a file descriptor at the OS level. This is why heavily loaded servers can hit fd limits — each connection has a real OS cost.

---

**Q3. Why can one Node.js thread handle multiple clients simultaneously?**

Node uses a single thread with an event loop managed by libuv, which uses epoll (on Linux) under the hood. Instead of blocking on each client or spawning a thread per connection, Node registers all open sockets with epoll and reacts only when a socket has data ready. No thread sits waiting — the OS delivers a notification, the event loop picks it up, and the right callback fires. Network I/O is truly async at the OS level, which makes this model efficient for connection-heavy workloads.