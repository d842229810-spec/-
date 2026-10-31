# Bilibili perception and operation adapter

Updated to the2026-10-31 source snapshot; see the [update and examples](../../../docs/UPDATE-20261031.en.md).

[中文](使用指南.md) | English

Package: `@local/lian-bili-perception` · Version: `1.4.0`.

## Features

Helps analyze Bilibili videos using available subtitles, sampled frames, text recognition and comments, with time-range selection for focused review.

## When to use it

For example, inspect what a video says around a particular minute by checking subtitles and sampled frames, then revisiting that time range. OCR reads text from images; ASR transcribes speech. Both results and sampling need review.

## Requirements and limitations

Media tools and local vision/audio services. Account operations need separate authorization and configuration.

## Entry points

`whale_bili_status / whale_bili_perceive；其余见源码注册`

Use the schemas exposed by the running host and the skill documents in this directory. A tool mentioned in source code is not necessarily registered by this component.

## Setup

Read the repository [installation guide](../../../docs/INSTALL.en.md). Generate a separate local path-configured copy; retain the plugin directory layout. Check package.json and any cordis.patch.yml before registering the package in a compatible, isolated Harness profile. Restart/reload and verify the actual entry, version and tool definitions. Start with read-only status checks or synthetic fixtures before enabling account, write or paid features.

This is a host plugin, not a standalone desktop app. Original README files may contain historical machine-specific test results; those results do not establish portability of this published snapshot.

## Provenance

Uses extraction code from [CZX2244/dsh-bilibili](https://github.com/CZX2244/dsh-bilibili), selected transcription checks from [Sacredbluedragon/dsh-bili-watch](https://github.com/Sacredbluedragon/dsh-bili-watch), and a sampling idea from [icyaaaww/dsh-bili-vision](https://github.com/icyaaaww/dsh-bili-vision). Their MIT licenses are included. Local adaptations add multi-part selection, interval sampling and caching. See [upstream sources and changes](../../../docs/UPSTREAM.en.md).

Original third-party licenses and copyright notices are retained.
