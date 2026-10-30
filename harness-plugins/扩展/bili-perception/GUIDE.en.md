# Bilibili perception and operation adapter

[中文](使用指南.md) | English

Package: `@local/lian-bili-perception` · Version: `1.4.0`.

## Features

Combines video perception, subtitle/audio information, OCR and platform-operation interfaces with source and observation scope.

## Requirements and limitations

Media tools and local vision/audio services. Account operations need separate authorization and configuration.

## Entry points

`whale_bili_status / whale_bili_perceive；其余见源码注册`

Use the schemas exposed by the running host and the skill documents in this directory. A tool mentioned in source code is not necessarily registered by this component.

## Setup

Read the repository [installation guide](../../../docs/INSTALL.en.md). Generate a separate local path-configured copy; retain the plugin directory layout. Check package.json and any cordis.patch.yml before registering the package in a compatible, isolated Harness profile. Restart/reload and verify the actual entry, version and tool definitions. Start with read-only status checks or synthetic fixtures before enabling account, write or paid features.

This is a host plugin, not a standalone desktop app. Original README files may contain historical machine-specific test results; those results do not establish portability of this published snapshot.

## Provenance

Modified integration with upstream code; see its license and notices.

Original third-party licenses and copyright notices are retained.
