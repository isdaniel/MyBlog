---
title: RustBox - Docker-Lite Sandbox for Hackers and Learners
date: 2025-06-01 23:30:11
tags: [Rust, Linux,docker]
categories: [Rust, Linux]
keywords: Rust,Linux,namespace,cgroup
---

Thank you for the clarification! Based on the actual purpose of your project — a **Linux sandboxing tool using OverlayFS, cgroups, and namespaces** — here’s a corrected and well-structured **Markdown tech blog post** introducing **RustBox**:

# 🧪 Introducing **RustBox**: Lightweight Linux Sandboxing in Pure Rust

Are you looking for a secure way to run untrusted programs on Linux, or want to learn how containers isolate processes using kernel features?

Meet **[RustBox](https://github.com/isdaniel/RustBox)** — a minimal, educational, and practical sandboxing tool built entirely in Rust. Powered by **OverlayFS**, **cgroups v2**, and **Linux namespaces**, it lets you isolate processes with fine-grained control — just like Docker, but lightweight and hackable.

## 🚀 What Is RustBox?

**RustBox** is a lightweight sandboxing utility that isolates and constrains programs in a secure environment using:

* 🗂 **OverlayFS** for ephemeral and isolated filesystems
* 🧠 **cgroups v2** for memory limits
* 🔐 **Linux namespaces** for process, network, user, and IPC isolation
* 🦀 Written in Rust (safe and unsafe), with `nix` and `std` — no external runtimes or daemons

This project is ideal for:

* Running untrusted or potentially harmful code
* Educational use to learn Linux sandbox internals
* Building lightweight, Docker-like containers without the overhead

## Overview

**Rustbox** creates a secure and minimal sandbox environment on Linux. It uses:
- **OverlayFS** for isolated file systems
- **Cgroups v2** to restrict memory and CPU usage
- **Linux namespaces** to isolate the process (PID, UTS, IPC, NET, USER)
- **Double fork** architecture for proper process isolation and resource cleanup

This tool is useful for running untrusted code in a controlled environment, testing, or creating lightweight containers.

## Double Fork Implementation

RustBox employs a **double fork** pattern to ensure proper process isolation and clean resource management:

### Process Hierarchy

```
[Outer Parent Process]
    └─> fork() #1
        ├─> [Namespaced Parent Process]
        │   ├─> unshare() - Creates new namespaces
        │   └─> fork() #2
        │       ├─> [Inner Child Process]
        │       │   ├─> Mount /proc and /dev
        │       │   ├─> chroot() to merged overlay
        │       │   ├─> chdir() to working directory
        │       │   └─> execv() - Execute shell/binary
        │       └─> [Namespaced Parent] waits for inner child
        │           └─> Unmounts /proc and /dev inside namespace
        └─> [Outer Parent] waits for namespaced parent
            ├─> Unmounts overlay filesystem
            └─> Cleans up cgroups
```

### Why Double Fork?

1. **First Fork (Outer → Namespaced Parent)**:
   - Isolates the namespace creation from the main process
   - Allows the outer parent to maintain control over cgroups and overlay mounts
   - Ensures cleanup happens outside the namespace context

2. **Second Fork (Namespaced Parent → Inner Child)**:
   - Creates PID 1 inside the new PID namespace
   - Provides proper process tree isolation
   - Enables the namespaced parent to handle cleanup of namespace-specific resources

3. **Cleanup Benefits**:
   - **Inner Child**: Executes user code in complete isolation
   - **Namespaced Parent**: Unmounts `/proc` and `/dev` after child exits (inside namespace)
   - **Outer Parent**: Unmounts overlay and removes cgroups (outside namespace)
   - Ensures resources are cleaned up in the correct order and context

## 🧰 Features

- **Isolated file system** using `overlayfs` with automatic cleanup
- **Memory and CPU constraints** with `cgroups v2`
- **Full namespace isolation** (PID, UTS, NET, USER, IPC)
- **Double fork architecture** for robust process management and resource cleanup
- **Custom shell or binary execution** inside the sandbox
- **Automatic resource cleanup** on exit (mounts, cgroups)
- Written in Rust with `nix` crate for safe syscall wrappers

## 📦 Requirements

- Linux kernel 5.x or higher (with overlayfs and cgroups v2 support)
- Rust (1.70+ recommended)
- Root privileges (for mounting and namespace ops)

## 🔧 Configuration

The sandbox is configured via the `SandboxConfig` struct:

```rust
pub struct SandboxConfig {
    pub base_dir: String,     // Base directory for overlayfs (e.g., ./rootfs)
    pub memory_limit: String, // Memory limit, e.g., "100M", "1G"
    pub cpu_limit: String,    // CPU limit as fraction, e.g., "0.5" (50% of one core)
    pub shell_path: String,   // Path to the shell or binary to execute
    pub workdir: String,      // Working directory inside container (e.g., "/")
}
```

### Command Line Usage

```bash
# Run with default settings
sudo ./target/debug/rustbox

# Custom configuration
sudo ./target/debug/rustbox \
    --base-dir ./rootfs \
    --memory 256M \
    --cpu-limit 0.5 \
    --shell /bin/bash \
    --workdir /root
```

## 📚 Learn More

If you’re curious about the internals of Linux isolation mechanisms and want to build your own container-like system from scratch, here are some great follow-up resources:

* 🔗 [Linux namespaces man pages](https://man7.org/linux/man-pages/man7/namespaces.7.html)
* 🔗 [OverlayFS documentation](https://www.kernel.org/doc/Documentation/filesystems/overlayfs.txt)
* 🔗 [Cgroups v2 guide](https://www.kernel.org/doc/html/latest/admin-guide/cgroup-v2.html)
* 🔗 [nix crate docs](https://docs.rs/nix/latest/nix/)

## 💬 Final Thoughts

**RustBox** is not a full container system, and that’s by design — it’s **transparent**, **hackable**, and **educational**. Whether you're looking to secure untrusted code, explore low-level Linux features, or just love writing systems code in Rust, RustBox is a fantastic playground.

> 💫 Give it a ⭐ on [GitHub](https://github.com/isdaniel/RustBox) and explore the source!

Would you like help turning this into a GitHub Pages site, Dev.to article, or adding diagrams for the sandbox architecture?
