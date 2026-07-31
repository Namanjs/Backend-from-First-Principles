# Week 2 — Exercise 3: Raw HTTP Server

## Reflection Questions

---

**Q1. What does `http.createServer()` actually create at the OS level?**

At the OS level, `http.createServer()` creates a TCP socket, binds it to a port, and listens for incoming connections — the same `socket()`, `bind()`, and `listen()` system calls from the TCP exercises. The HTTP layer on top adds protocol parsing — reading the method, URL, and headers from the raw incoming bytes. Everything else — routing, body parsing, response formatting, status codes — is entirely your own code. The `http` module is just a thin protocol parser sitting on top of a raw TCP server.

---

**Q2. How does Node determine when the request body is complete?**

The server determines this from the `Content-Length` header sent by the client. When the number of bytes received matches the declared `Content-Length`, the `end` event fires on `req`. For requests using chunked transfer encoding (`Transfer-Encoding: chunked`), the end is signaled by a special zero-length terminating chunk instead. `res.end()` is the outgoing response side and has nothing to do with determining when the incoming request body is complete.

---

**Q3. What HTTP header tells the client that the response will be chunked?**

`Transfer-Encoding: chunked`. Node sets this header automatically when you call `res.write()` multiple times without setting a `Content-Length` header upfront — because the total response size is not known in advance. It tells the client that data will arrive in chunks and that a zero-length chunk will signal the end of the response. This is exactly what the `/stream` route uses.

---

**Q4. What does Express's `express.json()` middleware actually do?**

It does exactly what the `POST /users` handler does manually — listens to the `data` events on `req`, collects the incoming chunks into an array, concatenates them with `Buffer.concat()`, calls `JSON.parse()` on the result, and attaches the parsed object to `req.body`. It also checks the `Content-Type` header to confirm the request is actually JSON before attempting to parse. That is all `express.json()` does — it is a thin wrapper around the manual body parsing pattern, applied automatically to every request via the middleware chain.