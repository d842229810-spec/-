# Autonomous learning and budget management

[中文](使用指南.md) | English

Package: `@local/dafeiyu-life` · Version: `1.4.5-lian.1`.

## Features

Schedules autonomous activities, tracks budget reservations and settlement, stores source cards and supports knowledge and Bilibili reading. Cross-process locks and conflict detection protect supported state updates.

## Requirements and limitations

Harness SDK; browser and media runtimes for related features. This budget is limited to integrated call paths, not all spending on the machine.

## Entry points

`whale_life_status / whale_life_control / whale_knowledge / whale_bili_read`

Use the schemas exposed by the running host and the skill documents in this directory. A tool mentioned in source code is not necessarily registered by this component.

## Setup

Read the repository [installation guide](../../docs/INSTALL.en.md). Generate a separate local path-configured copy; retain the plugin directory layout. Check package.json and any cordis.patch.yml before registering the package in a compatible, isolated Harness profile. Restart/reload and verify the actual entry, version and tool definitions. Start with read-only status checks or synthetic fixtures before enabling account, write or paid features.

This is a host plugin, not a standalone desktop app. Original README files may contain historical machine-specific test results; those results do not establish portability of this published snapshot.

## Provenance

Local integration with MIT-licensed upstream Bilibili adapter code.

Original third-party licenses and copyright notices are retained.
