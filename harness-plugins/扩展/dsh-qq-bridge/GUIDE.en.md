# Improved QQ bridge

[中文](使用指南.md) | English

Package: `dsh-qq-bridge` · Version: `0.6.2-lian.1`.

## Features

Connects QQ through OneBot HTTP, including private messages, addressed group routing, receipts and voice follow-up adapters.

## Requirements and limitations

A separately installed and authenticated OneBot backend. No account, token or group binding is provided.

## Entry points

`QQ桥界面及已加载的通信工具`

Use the schemas exposed by the running host and the skill documents in this directory. A tool mentioned in source code is not necessarily registered by this component.

## Setup

Read the repository [installation guide](../../../docs/INSTALL.en.md). Generate a separate local path-configured copy; retain the plugin directory layout. Check package.json and any cordis.patch.yml before registering the package in a compatible, isolated Harness profile. Restart/reload and verify the actual entry, version and tool definitions. Start with read-only status checks or synthetic fixtures before enabling account, write or paid features.

This is a host plugin, not a standalone desktop app. Original README files may contain historical machine-specific test results; those results do not establish portability of this published snapshot.

## Provenance

MIT derivative of Yuuyuko-uu/dsh-qq-bridge.

Original third-party licenses and copyright notices are retained.
