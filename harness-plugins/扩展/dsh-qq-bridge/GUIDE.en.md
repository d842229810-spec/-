# Improved QQ bridge

[中文](使用指南.md) | English

Package: `dsh-qq-bridge` · Version: `0.6.2-lian.2`.

## Features

Connects a Harness assistant to QQ through a separately logged-in QQ backend, supporting private/group messages and configured voice and delivery receipts.

## When to use it

For example, mention the assistant in an allowed group. Local rules first check whether a message addresses it, avoiding a model call for every message. OneBot is the interface between the QQ backend and plugin; install and sign in to a backend separately.

## Requirements and limitations

A separately installed and authenticated OneBot backend. No account, token or group binding is provided.

## Entry points

`QQ桥界面及已加载的通信工具`

Use the schemas exposed by the running host and the skill documents in this directory. A tool mentioned in source code is not necessarily registered by this component.

## Setup

Read the repository [installation guide](../../../docs/INSTALL.en.md). Generate a separate local path-configured copy; retain the plugin directory layout. Check package.json and any cordis.patch.yml before registering the package in a compatible, isolated Harness profile. Restart/reload and verify the actual entry, version and tool definitions. Start with read-only status checks or synthetic fixtures before enabling account, write or paid features.

This is a host plugin, not a standalone desktop app. Original README files may contain historical machine-specific test results; those results do not establish portability of this published snapshot.

## Provenance

Modified from [Yuuyuko-uu/dsh-qq-bridge](https://github.com/Yuuyuko-uu/dsh-qq-bridge) (MIT), adding group addressing/provenance, processing receipts and voice-follow-up adapters. The original LICENSE is included. See [upstream sources and changes](../../../docs/UPSTREAM.en.md).

Original third-party licenses and copyright notices are retained.

## 2026-10-30 update

Configure peerCommunication for selected senders/groups as described in the [update guide](../../../docs/CAPABILITY-UPGRADE-20261030.en.md). Direct liaison turns are not echoed into the owner’s QQ conversation.
