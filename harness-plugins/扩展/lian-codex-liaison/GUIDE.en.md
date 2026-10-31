# Harness–Codex liaison

Updated to the2026-10-31 source snapshot; see the [update and examples](../../../docs/UPDATE-20261031.en.md).

[中文](使用指南.md) | English

Package: `@local/lian-codex-liaison` · Version: `1.5.2`.

## Features

Lets an assistant in Harness exchange messages with a separate Codex session, reply and inspect delivery state, supporting conversations between assistants about a specific task.

## When to use it

For example, ask the other assistant to review a plan, then check whether it was accepted and answered. Configure both endpoints and sessions first; an unknown delivery status does not mean the recipient read it.

## Requirements and limitations

Codex CLI, a dedicated liaison session, local connection settings and the peer home MCP server. Login state and active sessions are not included.

## Entry points

`whale_codex`

Use the schemas exposed by the running host and the skill documents in this directory. A tool mentioned in source code is not necessarily registered by this component.

## Setup

Read the repository [installation guide](../../../docs/INSTALL.en.md). Generate a separate local path-configured copy; retain the plugin directory layout. Check package.json and any cordis.patch.yml before registering the package in a compatible, isolated Harness profile. Restart/reload and verify the actual entry, version and tool definitions. Start with read-only status checks or synthetic fixtures before enabling account, write or paid features.

This is a host plugin, not a standalone desktop app. Original README files may contain historical machine-specific test results; those results do not establish portability of this published snapshot.

## Provenance

Local communication bridge. Participant names inside the protocol are functional identity labels, not author credits.

Original third-party licenses and copyright notices are retained.

## 2026-10-30 update

A correlated incoming letter can return its normal final text and notify the fixed Codex liaison chat. Automatic forwarding requires a completed turn with no unrelated input. Explicit whale_codex reply remains supported and is not duplicated. Interrupted, mixed-input or textless turns require attention rather than fabricating a reply. Desktop and fixed liaison chats retain separate immediate contexts.
