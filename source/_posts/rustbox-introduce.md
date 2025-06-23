---
title: <RustBox> Docker-Lite Sandbox for Hackers and Learners
date: 2025-06-23 23:30:11
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

## 🧰 Features

| Feature                              | Description                                        |
| ------------------------------------ | -------------------------------------------------- |
| 🧾 Filesystem isolation              | Uses `OverlayFS` for a copy-on-write file system   |
| 💾 Memory limits                     | Enforced via `cgroups v2`                          |
| 🧍 Namespace separation              | Full separation of PID, UTS, NET, USER, IPC        |
| ⚙️ Custom shell or program execution | You define what runs in the sandbox                |
| 🦀 Built in Rust                     | Safe and unsafe Rust for low-level systems control |

## 📦 Requirements

To use RustBox, you’ll need:

* ✅ **Linux kernel 5.x+**
* ✅ **Cgroups v2** and `overlayfs` support enabled
* ✅ **Rust 1.70+**
* ✅ **Root privileges** (for mounting and namespace operations)

## 🔧 Configuration

RustBox is configured through a simple Rust struct:

```rust
pub struct SandboxConfig {
    pub base_dir: String,     // Base directory for OverlayFS, e.g. /tmp/sandbox
    pub memory_limit: String, // Memory limit, e.g., "100M"
    pub shell_path: String,   // Path to shell or binary inside sandbox
}
```

You can pass this struct to the sandbox engine to configure the runtime environment.

## 🛠️ How It Works

Here’s what happens under the hood when you launch a sandbox:

1. **OverlayFS Mounting**
   A new filesystem layer is created using OverlayFS, giving the process an isolated view of `/`.

2. **Namespace Cloning**
   Using `clone()` and `unshare()`, the process is moved into its own PID, UTS, NET, USER, and IPC namespaces.

3. **Memory Confinement**
   Cgroup v2 memory limits are applied by writing to `/sys/fs/cgroup`.

4. **Execution**
   The target binary (e.g., bash or your script) is launched inside this isolated, resource-restricted world.

## ▶️ Example Usage

Let’s say you want to sandbox `/bin/bash` with 100MB memory and a custom filesystem:

```rust
let config = SandboxConfig {
    base_dir: "/tmp/sandbox".to_string(),
    memory_limit: "100M".to_string(),
    shell_path: "/bin/bash".to_string(),
};

rustbox::run_sandbox(config)?;
```

Then run it with:

```bash
sudo ./target/debug/rustbox
```

And you’ll drop into a secure, limited environment.


## 🐞 Remote Debugging Support

RustBox can be remotely debugged using `lldb-server`:

```bash
sudo lldb-server platform --server --listen 127.0.0.1:12345 ./target/debug/rustbox
```

You can then connect from your IDE (e.g., VSCode with CodeLLDB) for deep debugging sessions inside the sandboxed environment. [Reference](https://github.com/vadimcn/codelldb/blob/master/MANUAL.md#connecting-to-lldb-server-agent)

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

<! Above information summaries from AI. />