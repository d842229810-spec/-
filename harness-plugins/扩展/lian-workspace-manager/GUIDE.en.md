# Local workspace manager

[中文](使用指南.md) | English

Package: `@local/lian-workspace-manager` · Version: `1.0.0`.

## Features

Manages local assistant workspaces: inspect or switch directories, repair session/workspace association and create backups.

## When to use it

For example, check or change the project directory associated with a conversation. It can affect real files and session settings, so back up and stop related writers first.

## Requirements and limitations

Matching Harness session storage. Back up state and stop related writers before changes.

## Entry points

`本地管理界面，见workspace-manager.mjs`

Use the schemas exposed by the running host and the skill documents in this directory. A tool mentioned in source code is not necessarily registered by this component.

## Setup

Read the repository [installation guide](../../../docs/INSTALL.en.md). Generate a separate local path-configured copy; retain the plugin directory layout. Check package.json and any cordis.patch.yml before registering the package in a compatible, isolated Harness profile. Restart/reload and verify the actual entry, version and tool definitions. Start with read-only status checks or synthetic fixtures before enabling account, write or paid features.

This is a host plugin, not a standalone desktop app. Original README files may contain historical machine-specific test results; those results do not establish portability of this published snapshot.

## Provenance

Local maintenance tool; choose the entry compatible with the actual profile.

Original third-party licenses and copyright notices are retained.
