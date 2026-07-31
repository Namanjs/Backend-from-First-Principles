# Exercise 2: I/O-Bound Waiting vs CPU-Bound Blocking — Reflection Questions

---

**Q1. Why does `/wait` not block other requests but `/block` does?**

`/wait` uses `setTimeout` which is an async timer — it registers the callback, pushes it to the timer queue, and immediately gives control back to the event loop. The event loop is free to handle other requests while the timer counts down. `/block` runs a synchronous `while` loop that never yields — the thread is busy the entire time and the event loop cannot move on until the loop finishes.

---

**Q2. What is the event loop doing during the 3-second wait in `/wait`?**

The event loop is not blocked. It continues looping through all its phases normally — picking up and executing other callbacks, handling other incoming requests, doing its job as expected. The `/wait` callback simply sits in the timer queue until 3 seconds have passed.

---

**Q3. What is the event loop doing during the 3-second block in `/block`?**

The event loop is completely stuck. The thread is occupied by the `while` loop and control is never given back to the event loop. No other callbacks can execute, no other requests can be handled — the entire server freezes until the loop exits.

---

**Q4. In what event loop phase does the `/wait` callback execute?**

The timers phase. This is the first phase of the event loop and it executes callbacks registered by `setTimeout` and `setInterval` whose delay has expired.

---

**Q5. If a production route accidentally contained a CPU-heavy operation, how would you detect it?**

The manual approach is to log a timestamp at the start and end of every request — any route with an unusually large difference is the culprit. In production this is done properly with response time middleware that instruments every route automatically without touching individual handlers. Tools like Clinic.js, Datadog, or New Relic do this at scale — they track response times across all routes, visualize spikes, and can produce flame graphs showing exactly which function is consuming CPU time.