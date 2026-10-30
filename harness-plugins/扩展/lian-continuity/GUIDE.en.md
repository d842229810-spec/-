# Memory, tasks and context continuity

[中文](使用指南.md) | English

Package: `@local/lian-continuity` · Version: `1.3.1`.

## Features

Helps the assistant continue work: search saved records, inspect original surrounding text, track tasks and save a handoff summary when a chat grows long.

## When to use it

For example, when returning to a video project days later, find the task and review its prior conclusion and source text. A read receipt states what was returned; it does not prove comprehension or permanent recall.

## Requirements and limitations

Harness SDK and dafeiyu-life; Python/SQLite for applicable storage. No personal memory database is included.

## Entry points

`whale_continuity / whale_life_memory / whale_memory_vault / whale_task_board / whale_context_pack`

Use the schemas exposed by the running host and the skill documents in this directory. A tool mentioned in source code is not necessarily registered by this component.

## Setup

Read the repository [installation guide](../../../docs/INSTALL.en.md). Generate a separate local path-configured copy; retain the plugin directory layout. Check package.json and any cordis.patch.yml before registering the package in a compatible, isolated Harness profile. Restart/reload and verify the actual entry, version and tool definitions. Start with read-only status checks or synthetic fixtures before enabling account, write or paid features.

This is a host plugin, not a standalone desktop app. Original README files may contain historical machine-specific test results; those results do not establish portability of this published snapshot.

## Provenance

Local continuity plugin.

Original third-party licenses and copyright notices are retained.
