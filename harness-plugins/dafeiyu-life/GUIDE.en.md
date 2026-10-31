# Autonomous learning and budget management

Updated to the2026-10-31 source snapshot; see the [update and examples](../../docs/UPDATE-20261031.en.md).

[中文](使用指南.md) | English

Package: `@local/dafeiyu-life` · Version: `1.4.5-lian.1`.

## Features

Lets the assistant study during configured hours and manage an activity budget: for example, research a topic, save source cards, reserve estimated cost before an integrated model call and settle it afterward.

## When to use it

Use it when you want an assistant to research configured topics while you are away and manage the cost of those activities. Configure the schedule, budget and allowed tools first. Manual tasks and other unintegrated paid services are not controlled by this budget.

## Requirements and limitations

Harness SDK; browser and media runtimes for related features. This budget is limited to integrated call paths, not all spending on the machine.

## Entry points

`whale_life_status / whale_life_control / whale_knowledge / whale_bili_read`

Use the schemas exposed by the running host and the skill documents in this directory. A tool mentioned in source code is not necessarily registered by this component.

## Setup

Read the repository [installation guide](../../docs/INSTALL.en.md). Generate a separate local path-configured copy; retain the plugin directory layout. Check package.json and any cordis.patch.yml before registering the package in a compatible, isolated Harness profile. Restart/reload and verify the actual entry, version and tool definitions. Start with read-only status checks or synthetic fixtures before enabling account, write or paid features.

This is a host plugin, not a standalone desktop app. Original README files may contain historical machine-specific test results; those results do not establish portability of this published snapshot.

## Provenance

Reuses the provider, types and wbi files from [moxingovo/dsh-bilibili](https://github.com/moxingovo/dsh-bilibili) 0.2.4 (MIT), adapted to the local bounded transport. Scheduling and budget reliability are local integration. See [upstream sources and changes](../../docs/UPSTREAM.en.md).

Original third-party licenses and copyright notices are retained.
