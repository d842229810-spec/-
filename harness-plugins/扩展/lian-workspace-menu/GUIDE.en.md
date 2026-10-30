# Workspace menu

[中文](使用指南.md) | English

Package: `@local/lian-workspace-menu` · Version: `1.1.0`.

## Features

Adds workspace entry points and directory-switching interaction to the Harness frontend.

## Requirements and limitations

Harness client workspace services. It cannot run as a standalone Node application.

## Entry points

`Harness客户端菜单`

Use the schemas exposed by the running host and the skill documents in this directory. A tool mentioned in source code is not necessarily registered by this component.

## Setup

Read the repository [installation guide](../../../docs/INSTALL.en.md). Generate a separate local path-configured copy; retain the plugin directory layout. Check package.json and any cordis.patch.yml before registering the package in a compatible, isolated Harness profile. Restart/reload and verify the actual entry, version and tool definitions. Start with read-only status checks or synthetic fixtures before enabling account, write or paid features.

This is a host plugin, not a standalone desktop app. Original README files may contain historical machine-specific test results; those results do not establish portability of this published snapshot.

## Provenance

Local frontend adapter.

Original third-party licenses and copyright notices are retained.
