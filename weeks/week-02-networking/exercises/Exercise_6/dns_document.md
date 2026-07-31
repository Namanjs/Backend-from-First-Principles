# DNS Resolution Report

## 1. `dig api.github.com`

### Command

```bash
dig api.github.com
```

### Results

- **Hostname:** `api.github.com`
- **Record Type:** `A`
- **IP Address Returned:** `20.207.73.85`
- **TTL:** `49` seconds
- **CNAME Records:** None

### Notes

- The query returned a single IPv4 (`A`) record.
- No `CNAME` records were present.
- The TTL of **49 seconds** indicates that the DNS resolver can cache this record for another 49 seconds before requesting it again.

---

## 2. `dig google.com`

### Command

```bash
dig google.com
```

### Results

| Record Type | IP Address |
| ------------ | ---------- |
| A | 192.178.158.101 |
| A | 192.178.158.138 |
| A | 192.178.158.102 |
| A | 192.178.158.113 |
| A | 192.178.158.100 |
| A | 192.178.158.139 |

- **TTL:** `123` seconds
- **CNAME Records:** None

### Notes

- The DNS query returned **six A records**.
- Multiple IP addresses are commonly used for **DNS load balancing**, allowing requests to be distributed across multiple servers.
- All returned records had the same TTL of **123 seconds**.

---

## 3. `dig +trace api.github.com`

### Command

```bash
dig +trace api.github.com
```

### Resolution Chain

#### Step 1 – Local DNS Resolver

The query was first sent to the local resolver:

```
127.0.0.53
```

This is the local `systemd-resolved` service running on the machine.

---

#### Step 2 – Root DNS Servers

The local resolver contacted a root DNS server.

The root server returned the authoritative name servers for the `.com` top-level domain.

Example:

```
a.root-servers.net
b.root-servers.net
...
m.root-servers.net
```

The trace continued using:

```
j.root-servers.net
```

---

#### Step 3 – `.com` TLD Name Servers

The root server referred the resolver to the `.com` TLD name servers.

Example:

```
a.gtld-servers.net
b.gtld-servers.net
...
m.gtld-servers.net
```

The trace continued using:

```
e.gtld-servers.net
```

---

#### Step 4 – GitHub Authoritative Name Servers

The `.com` TLD server returned GitHub's authoritative DNS servers:

```
ns-520.awsdns-01.net
ns-421.awsdns-52.com
ns-1707.awsdns-21.co.uk
ns-1283.awsdns-32.org
dns1.p08.nsone.net
dns2.p08.nsone.net
dns3.p08.nsone.net
dns4.p08.nsone.net
```

The trace continued using:

```
ns-520.awsdns-01.net
```

---

#### Step 5 – Final Answer

The authoritative DNS server returned:

| Record Type | Value |
| ------------ | ----- |
| A | 20.207.73.85 |

TTL:

```
60 seconds
```

No `CNAME` records were returned.

---

## IPv6 Messages

During the trace, the following messages appeared:

```
UDP setup with 2001:...
network unreachable
```

These messages indicate that the system attempted to contact IPv6 DNS servers but IPv6 networking was unavailable. The resolver automatically retried using IPv4, and the DNS lookup completed successfully.

---

# Summary

| Command | IP Address(s) | TTL | CNAME |
|---------|---------------|-----|--------|
| `dig api.github.com` | `20.207.73.85` | 49 | None |
| `dig google.com` | `192.178.158.101`, `192.178.158.138`, `192.178.158.102`, `192.178.158.113`, `192.178.158.100`, `192.178.158.139` | 123 | None |
| `dig +trace api.github.com` | `20.207.73.85` | 60 | None |

## Resolution Path for `api.github.com`

```
Local Resolver (127.0.0.53)
        │
        ▼
Root DNS Server
        │
        ▼
.com TLD DNS Server
        │
        ▼
GitHub Authoritative DNS Server
        │
        ▼
api.github.com
        │
        ▼
20.207.73.85
```