# DNS and Thread Pool Questions

## 1. What is the difference between `dns.lookup()` and `dns.resolve4()` in Node.js?

### `dns.lookup()`
- Uses the operating system's DNS resolver (`getaddrinfo()`).
- Respects the OS DNS configuration, DNS cache, and hosts file (such as `/etc/hosts`).
- Internally, Node.js executes this blocking system call in the **libuv thread pool**.
- If many `dns.lookup()` operations run simultaneously, they can occupy the thread pool and delay other thread-pool-based operations.

### `dns.resolve4()`
- Uses the **c-ares** library to perform DNS queries directly.
- Bypasses the operating system's resolver and sends DNS requests directly to the configured DNS servers.
- Does **not** rely on the libuv thread pool for the DNS lookup itself.
- Returns only IPv4 addresses for the hostname.

### Summary

| `dns.lookup()` | `dns.resolve4()` |
|----------------|------------------|
| Uses the OS resolver (`getaddrinfo()`) | Uses the c-ares DNS library |
| Uses the libuv thread pool | Does not use the thread pool for DNS queries |
| Respects the hosts file and OS DNS cache | Performs direct DNS queries |
| Can return IPv4 and IPv6 addresses | Returns only IPv4 DNS records |

---

## 2. Why did `fs.readFile()` get delayed when DNS lookups saturated the thread pool?

Both `dns.lookup()` and `fs.readFile()` use the **libuv thread pool**.

When the thread pool size is small (for example, `UV_THREADPOOL_SIZE=2`) and many `dns.lookup()` calls are started concurrently, all available worker threads become busy resolving DNS names.

Since `fs.readFile()` also requires a worker thread, it must wait until one becomes available. As a result, the file read operation starts later than expected and takes longer to complete.

This phenomenon is called **thread pool saturation**.

---

## 3. In a Kubernetes environment, what DNS server resolves service names?

By default, Kubernetes uses **CoreDNS** (older Kubernetes versions used **kube-dns**).

CoreDNS runs inside the Kubernetes cluster and resolves internal service names such as:

```
my-service.default.svc.cluster.local
```

When a Pod sends a DNS request:

1. The request goes to CoreDNS.
2. CoreDNS checks whether the name belongs to a Kubernetes Service.
3. If it is an internal service, CoreDNS returns the corresponding ClusterIP.
4. If it is an external domain (e.g., `google.com`), CoreDNS forwards the request to upstream DNS servers.

---

## 4. What would happen if your DNS resolver was unreachable?

If the configured DNS resolver becomes unreachable:

- Hostnames cannot be translated into IP addresses.
- `dns.lookup()` and `dns.resolve4()` will fail with DNS-related errors such as `EAI_AGAIN` or `ENOTFOUND`, depending on the failure.
- Applications that rely on hostnames (web servers, databases, APIs, etc.) cannot establish new connections.
- Existing network connections that are already established usually continue to work until they are closed.
- In Kubernetes, if CoreDNS becomes unavailable, Pods cannot resolve Service names, which can break communication between services throughout the cluster.

---

# Key Takeaways

- `dns.lookup()` uses the operating system's DNS resolver and the **libuv thread pool**.
- `dns.resolve4()` uses the **c-ares** library to perform direct asynchronous DNS queries.
- Heavy use of `dns.lookup()` can saturate the thread pool and delay other thread-pool-based operations such as `fs.readFile()`.
- Kubernetes uses **CoreDNS** to resolve internal Service names.
- If the DNS resolver is unreachable, hostname resolution fails, preventing applications from creating new network connections using domain names.