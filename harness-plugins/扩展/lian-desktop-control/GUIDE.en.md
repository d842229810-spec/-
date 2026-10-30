# Windows desktop observation and control

[中文](使用指南.md) | English

Package: `@local/lian-desktop-control` · Version: `1.5.0`.

## Features

Lets the assistant list and observe Windows windows via screenshots and, when authorized, operate the mouse and keyboard. It also supports short recordings and audio/video capture.

## When to use it

For example, inspect an application settings page and help click controls. An interactive Windows session and Python dependencies are required; confirm the target window and user authorization.

## Requirements and limitations

Windows, an interactive desktop and the declared Python dependencies. Not intended for headless systems.

## Entry points

`whale_desktop_windows / whale_desktop_control / whale_desktop_observe`

Use the schemas exposed by the running host and the skill documents in this directory. A tool mentioned in source code is not necessarily registered by this component.

## Setup

Read the repository [installation guide](../../../docs/INSTALL.en.md). Generate a separate local path-configured copy; retain the plugin directory layout. Check package.json and any cordis.patch.yml before registering the package in a compatible, isolated Harness profile. Restart/reload and verify the actual entry, version and tool definitions. Start with read-only status checks or synthetic fixtures before enabling account, write or paid features.

This is a host plugin, not a standalone desktop app. Original README files may contain historical machine-specific test results; those results do not establish portability of this published snapshot.

## Provenance

Local Windows adapter.

Original third-party licenses and copyright notices are retained.
