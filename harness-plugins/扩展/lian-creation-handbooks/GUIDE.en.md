# Creative methods library

[中文](使用指南.md) | English

Package: `@local/lian-creation-handbooks` · Version: `4.6.1`.

## Features

Provides creative-method material searchable by topic and chapter, covering storytelling, dialogue, visual design, video direction and project handoff.

## When to use it

For example, consult a dialogue chapter while writing a scene, or review storyboard and pacing methods before making a video. It provides reference material and a reader, not an automatically finished work or a personality preset.

## Requirements and limitations

Harness SDK. The library is not a personality preset and does not replace the assistant identity.

## Entry points

`whale_creation_read`

Use the schemas exposed by the running host and the skill documents in this directory. A tool mentioned in source code is not necessarily registered by this component.

## Setup

Read the repository [installation guide](../../../docs/INSTALL.en.md). Generate a separate local path-configured copy; retain the plugin directory layout. Check package.json and any cordis.patch.yml before registering the package in a compatible, isolated Harness profile. Restart/reload and verify the actual entry, version and tool definitions. Start with read-only status checks or synthetic fixtures before enabling account, write or paid features.

This is a host plugin, not a standalone desktop app. Original README files may contain historical machine-specific test results; those results do not establish portability of this published snapshot.

## Provenance

The creative methods are adapted from the maintainer-supplied Meiyi V4.6.1 project; the maintainer confirmed that they previously created the agent. This plugin adapts that material into a Harness chapter-reading tool.

Original third-party licenses and copyright notices are retained.
