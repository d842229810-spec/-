# External tool connection configuration

[中文](使用指南.md) | English

Package: `dafeiyu-creator-toolbox` · Version: `1.0.2`.

## Features

Connects external browser, FFmpeg and related MCP services. Includes legacy offline TTS helper code.

## Requirements and limitations

Install and configure the referenced MCP services separately. Legacy TTS files do not identify the active voice.

## Entry points

`通过Harness的MCP工具列表查看实际加载结果`

Use the schemas exposed by the running host and the skill documents in this directory. A tool mentioned in source code is not necessarily registered by this component.

## Setup

Read the repository [installation guide](../../docs/INSTALL.en.md). Generate a separate local path-configured copy; retain the plugin directory layout. Check package.json and any cordis.patch.yml before registering the package in a compatible, isolated Harness profile. Restart/reload and verify the actual entry, version and tool definitions. Start with read-only status checks or synthetic fixtures before enabling account, write or paid features.

This is a host plugin, not a standalone desktop app. Original README files may contain historical machine-specific test results; those results do not establish portability of this published snapshot.

## Provenance

Local connection and adapter configuration.

Original third-party licenses and copyright notices are retained.
