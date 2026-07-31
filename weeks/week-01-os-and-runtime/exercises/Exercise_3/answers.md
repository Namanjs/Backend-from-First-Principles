# Exercise 3: File Descriptor Investigation — Reflection Questions

---

**Q1. What was your FD limit?**

The soft limit was 1024 — this is the actual enforced limit for the current session. The VS Code terminal showed a much higher number (around 1048576) because VS Code sets a high soft limit for its own process when it launches (it needs to watch thousands of files for changes, each of which costs an fd), and that limit gets inherited by any terminal it spawns.

Running both explicitly:
- `ulimit -Sn` → soft limit (enforced, default 1024)
- `ulimit -Hn` → hard limit (ceiling you can raise to without root, ~1048576)

---

**Q2. Why did the FD numbers start at 3 (not 0)?**

Because 0, 1, and 2 are reserved by the OS for every process by default:
- fd 0 → stdin (standard input)
- fd 1 → stdout (standard output)
- fd 2 → stderr (standard error)

Every process starts with these three already open, so the first fd available for your script to use is 3.

---

**Q3. In a real server, what resources consume file descriptors?**

Every time a process opens a file, creates a network socket, or creates a pipe, the OS assigns it an fd. In a production server this means:
- Open files (logs, config files, static assets)
- Network sockets (one per client connection)
- Pipes (communication between processes)
- File watchers (monitoring files for changes)

This is why heavily loaded servers can exhaust their fd limit — each client connection alone costs one fd.

---

**Q4. How would you increase the limit in production?**

`ulimit -n 65535` raises it for the current session only. In production it needs to be set permanently so it survives reboots:
- Via `/etc/security/limits.conf` for system-wide configuration
- Via `LimitNOFILE` in your systemd service file for per-service configuration