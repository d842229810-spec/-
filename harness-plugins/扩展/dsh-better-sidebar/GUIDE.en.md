# Improved sidebar

[中文](使用指南.md) | English

Package: `dsh-better-sidebar` · Version: `0.28.0-lian.1`.

## Features

Adds a file tree, editing, search and session-workspace UI, with path validation, recovery and write-reliability changes.

## Requirements and limitations

Harness frontend services and npm dependencies. Bundled output may still need SDK-path adaptation.

## Entry points

`图形侧栏；改动见UPGRADE-LIAN.md`

Use the schemas exposed by the running host and the skill documents in this directory. A tool mentioned in source code is not necessarily registered by this component.

## Setup

Read the repository [installation guide](../../../docs/INSTALL.en.md). Generate a separate local path-configured copy; retain the plugin directory layout. Check package.json and any cordis.patch.yml before registering the package in a compatible, isolated Harness profile. Restart/reload and verify the actual entry, version and tool definitions. Start with read-only status checks or synthetic fixtures before enabling account, write or paid features.

This is a host plugin, not a standalone desktop app. Original README files may contain historical machine-specific test results; those results do not establish portability of this published snapshot.

## Provenance

MIT derivative of omdsh-dev/DSH-better-sidebar.

Original third-party licenses and copyright notices are retained.
