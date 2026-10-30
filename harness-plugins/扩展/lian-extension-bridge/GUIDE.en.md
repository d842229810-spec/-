# Extension status and memory service bridge

[中文](使用指南.md) | English

Package: `@local/lian-extension-bridge` · Version: `1.1.1`.

## Features

Checks extension/tool availability and connects the assistant to local memory services such as ReMe. ReMe is installed separately; this plugin does not contain your memory data.

## When to use it

Use it to check whether memory or creative services are loaded, or to search an already connected local memory service. Install and start that service first.

## Requirements and limitations

Configure ReMe separately. Existing service data is not distributed.

## Entry points

`whale_extension_status / whale_memory_search`

Use the schemas exposed by the running host and the skill documents in this directory. A tool mentioned in source code is not necessarily registered by this component.

## Setup

Read the repository [installation guide](../../../docs/INSTALL.en.md). Generate a separate local path-configured copy; retain the plugin directory layout. Check package.json and any cordis.patch.yml before registering the package in a compatible, isolated Harness profile. Restart/reload and verify the actual entry, version and tool definitions. Start with read-only status checks or synthetic fixtures before enabling account, write or paid features.

This is a host plugin, not a standalone desktop app. Original README files may contain historical machine-specific test results; those results do not establish portability of this published snapshot.

## Provenance

Local service adapter.

Original third-party licenses and copyright notices are retained.

## 2026-10-30 update

Adds whale_capability_find, for example {"query":"这一秒长什么样","limit":2}. It returns relevant tools, examples and actual registration state; external dependencies still require verification.
