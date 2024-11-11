---
title: Understand TLS/SSL networking flow
date: 2024-11-11 22:30:11
tags: [ssl,tls]
categories: [ssl,tls]
keywords: ssl,tls, security
---
## Foreword

TLS (Transport Layer Security) is a cryptographic protocol that provides secure communication over a network, commonly used to secure HTTP traffic (i.e., HTTPS). Here’s a high-level overview of the TLS workflow, which includes handshake and data transfer phases.

After TCP handshake, it will execute TLS handshake if client require, below image is my experiment TLS workflow from PostgreSQL server, Red-frame represent TCP 3 handshake, and yellow-frame represent TLS handshake

![img](/images/tls-ssl/2024-11-11_15h17_11.png)

In the beginning, client will send a request to require sslmode connection (SSL/TLS), if server support it will reply ('S').

![img](/images/tls-ssl/2024-11-11_17h48_32.png)

Eventually, processing below steps to do TLS handshake.

1. ClientHello → 2. ServerHello → 3. Server Certificate → 4. ServerHelloDone → 5. Client Key Exchange

### TLS work-flow

1. Client Hello:
   * The TLS version the client supports.
   * A list of cipher suites (encryption algorithms) it supports.
   * A random number (used later for generating encryption keys).
2. Server Hello:
   * The TLS version and cipher suite that it chose based on the client’s list.
   * A random number.
   * Other optional configurations, such as session IDs or extensions.
3. Server Certificate and Optional Server Key Exchange
4. Server Hello Done
5. Client Key Exchange

### Certificate & Root Certificate file

* Root Certificate file: A root certificate is the top-level certificate in a certificate chain and serves as the foundation of trust for all other certificates within the hierarchy.
  * Lifespan: Root certificates are used to issue intermediate certificates, which in turn issue end-entity certificates. This hierarchy enhances security by limiting direct exposure of the root certificate.
* Certificate file: This type of certificate is used to verify the identity of an entity, like a website, individual, or organization, and is typically issued by an intermediate certificate, not directly by the root.
  * Lifespan:They usually have shorter lifespans (often 1-2 years) to enhance security through periodic renewal and revocation if compromised.

Certificate file would be verified whether valid by Root certificate, and OS machine would install Root certificate file when we setup our machine.

> The root certificate is the trust anchor, while end-entity certificates rely on this anchor for trust. This hierarchy allows a scalable, secure infrastructure where trust flows from the root certificate down to the individual end-entity certificates.

