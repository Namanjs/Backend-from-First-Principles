# Week 2 — Exercise 2: TCP Echo Server with Connection Tracking

## Reflection Questions

---

**Q1. How does your server know when a command ends and another begins?**

TCP is a byte stream, not a message stream. A single `data` event can contain multiple commands, or one command can be split across multiple `data` events — there is no concept of message boundaries at the TCP level.

This protocol uses `\n` as the command delimiter. To handle this correctly, each socket maintains its own buffer string. On every `data` event, incoming bytes are appended to that buffer. The buffer is then split on `\n` — everything before the last element are complete commands and get processed immediately. The last element, whether empty or a partial command, stays in the buffer and waits for the next `data` event to complete it.

This is why `parts.pop()` is the key operation — it always removes and returns the last element, which is either `""` (command was complete) or a partial string (command is still arriving).

---

**Q2. What happens if a client sends data faster than your server can process it? (backpressure)**

TCP does not drop packets at the application level — it guarantees delivery via automatic retransmission. What happens instead is backpressure via TCP flow control. When the server's receive buffer fills up, TCP signals the sender to slow down by shrinking the receive window to zero. The sender pauses until the server drains its buffer and the window opens again.

At the Node.js level, `socket.write()` returns `false` when the kernel send buffer is full, signaling that you should stop writing until the `drain` event fires on the socket. No data is lost — the sender is simply throttled until the server catches up.

---

**Q3. How does your idle timeout work at the implementation level?**

`socket.setTimeout(60000)` registers a 60 second idle timer on the socket. Node resets this timer every time data arrives on the socket. If no data arrives within the 60 second window, the `timeout` event fires. In the timeout handler the server writes a disconnection message and calls `socket.end()` to close the connection gracefully. This prevents silent disconnected clients from holding open connections indefinitely.