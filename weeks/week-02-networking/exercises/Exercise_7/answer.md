# TLS Certificate Inspection – Conceptual Questions

## 1. Why does a certificate chain exist? Why not have the server's certificate signed directly by a Root CA?

A certificate chain exists to improve both **security** and **scalability**.

Root Certificate Authorities (Root CAs) are the highest level of trust in the Public Key Infrastructure (PKI). Their private keys are extremely valuable and are kept offline and used only in rare situations.

Instead of signing every website's certificate directly, a Root CA signs one or more **Intermediate CAs**, and those Intermediate CAs issue certificates to websites.

This approach provides several benefits:

* The Root CA's private key remains highly protected.
* Intermediate CAs can issue certificates for millions of websites.
* If an Intermediate CA is compromised, it can be revoked and replaced without replacing the trusted Root CA.
* The overall trust model becomes easier to manage and more secure.

---

## 2. What happens if a certificate expires? What error would the client see?

Every TLS certificate contains a validity period defined by the **Not Before** and **Not After** fields.

During the TLS handshake, the client verifies that the current date falls within this validity period. If the certificate has expired, the client considers it untrusted and the TLS handshake fails.

Common browser errors include:

* **Chrome:** `NET::ERR_CERT_DATE_INVALID`
* **Firefox:** `SEC_ERROR_EXPIRED_CERTIFICATE`

Most browsers display a warning indicating that the connection is not private or cannot be trusted.

---

## 3. What is SNI (Server Name Indication) and why is it needed?

Server Name Indication (SNI) is a TLS extension that allows the client to specify the hostname it wants to connect to during the TLS handshake.

This is necessary because a single server or IP address can host multiple HTTPS websites, each with its own TLS certificate.

By sending the requested hostname (for example, `api.github.com`) during the handshake, the server knows which certificate to present. Without SNI, the server would not know which certificate to send, causing certificate validation to fail for many hosted websites.

---

## 4. Why is TLS termination at the load balancer a common pattern?

TLS termination means that the load balancer handles the TLS handshake, decrypts incoming HTTPS traffic, and forwards requests to backend servers.

This is a common architecture because it:

* Centralizes certificate management.
* Simplifies certificate renewal and rotation.
* Reduces the CPU overhead of TLS encryption and decryption on backend servers.
* Allows backend services to focus on application logic.
* Makes it easier to enforce consistent security policies and logging.

In environments where end-to-end encryption is required, the load balancer can establish a new TLS connection to the backend services after terminating the client's TLS connection.
