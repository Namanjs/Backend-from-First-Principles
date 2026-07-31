# Exercise 6: Event Loop Phase Order — Summary Document

---

**Q1. The order of priority: sync → nextTick → microtasks → timers/check/poll**

The correct order across all Node.js versions is:

`sync → nextTick → promises (microtasks) → timers/poll/check`

`process.nextTick` has always had higher priority than promise microtasks — this has not changed in any Node.js version. What changed in Node v11+ was different: before v11, microtasks were only flushed at the end of each full event loop tick. After v11, microtasks flush between every individual callback/task, aligning with browser behavior. But the drain order within microtasks — nextTick first, then promises — has remained constant.

---

**Q2. Why nextTick drains completely before promise microtasks**

`process.nextTick` has a dedicated queue that is checked and fully drained before the promise microtask queue is processed. This is by design — nextTick was originally intended as a way to schedule something "before any I/O, before any timers, before anything else." So when both a nextTick and a resolved promise are pending, nextTick always goes first and its entire queue empties before a single promise callback runs. This means a nextTick that recursively schedules another nextTick will starve promise microtasks as well as the rest of the event loop.

---

**Q3. Why setImmediate inside an I/O callback always runs before setTimeout 0**

Inside an I/O callback, the event loop is currently in the poll phase. After poll comes the check phase — which is exactly where `setImmediate` callbacks execute. So `setImmediate` runs in the very next phase. `setTimeout 0` has to wait for the next iteration of the loop to reach the timers phase again, because the timers phase has already passed in the current iteration. This makes the order deterministic inside I/O callbacks: poll → check (setImmediate) → next iteration timers (setTimeout). Outside an I/O callback the order is non-deterministic because it depends on how fast the timer is registered relative to where the event loop currently is.

---

**Q4. What happens when you schedule nextTick recursively and why it's dangerous**

Since the nextTick queue must drain completely before the event loop can move forward, a `process.nextTick` that recursively schedules another `process.nextTick` creates an infinite queue that never empties. The event loop is permanently stuck — timers never fire, I/O never completes, promise microtasks never run, incoming requests never get handled. This is called starving the event loop. The server appears to be running but is effectively frozen.