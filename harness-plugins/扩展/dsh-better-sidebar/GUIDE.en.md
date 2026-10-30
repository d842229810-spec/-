# Improved sidebar

[中文](使用指南.md) | English

Package: `dsh-better-sidebar` · Version: `0.28.0-lian.1`.

## Features

Adds a file sidebar to Harness for browsing, searching and editing workspace files; this modified version also retains recovery records for deletions and overwrites.

## When to use it

For example, find and edit project files alongside a chat, then recover a deletion from a recovery record. Workspace path checks are application-level controls, not a replacement for OS permissions.

## Requirements and limitations

Harness frontend services and npm dependencies. Bundled output may still need SDK-path adaptation.

## Entry points

`图形侧栏；改动见UPGRADE-LIAN.md`

Use the schemas exposed by the running host and the skill documents in this directory. A tool mentioned in source code is not necessarily registered by this component.

## Setup

Read the repository [installation guide](../../../docs/INSTALL.en.md). Generate a separate local path-configured copy; retain the plugin directory layout. Check package.json and any cordis.patch.yml before registering the package in a compatible, isolated Harness profile. Restart/reload and verify the actual entry, version and tool definitions. Start with read-only status checks or synthetic fixtures before enabling account, write or paid features.

This is a host plugin, not a standalone desktop app. Original README files may contain historical machine-specific test results; those results do not establish portability of this published snapshot.

## Provenance

Modified from [omdsh-dev/DSH-better-sidebar](https://github.com/omdsh-dev/DSH-better-sidebar) (MIT), adding workspace path checks, deletion/overwrite recovery and concurrent-save protection. The original LICENSE is included. See [upstream sources and changes](../../../docs/UPSTREAM.en.md).

Original third-party licenses and copyright notices are retained.
