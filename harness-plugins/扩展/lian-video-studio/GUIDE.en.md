# Video production and exported-film review

[中文](使用指南.md) | English

Package: `@local/lian-video-studio` · Version: `1.5.2-lian.1`.

## Features

Creates, previews and exports code-based videos and helps inspect the exported file. It can sample a video into a timestamped image grid and retrieve the original frame for a selected cell.

## When to use it

For example, make a ten-second animation, preview/export it and inspect subtitles, audio or key frames. Remotion makes video with React; FFmpeg processes media. Their environments must be installed separately. A grid is a sample, not every frame.

## Requirements and limitations

lian-video-runtime and FFmpeg; optional local vision/audio services for perception. Sampling does not imply continuous viewing.

## Entry points

`whale_video_project / whale_video_render / whale_film_evidence / whale_creative_review`

Use the schemas exposed by the running host and the skill documents in this directory. A tool mentioned in source code is not necessarily registered by this component.

## Setup

Read the repository [installation guide](../../../docs/INSTALL.en.md). Generate a separate local path-configured copy; retain the plugin directory layout. Check package.json and any cordis.patch.yml before registering the package in a compatible, isolated Harness profile. Restart/reload and verify the actual entry, version and tool definitions. Start with read-only status checks or synthetic fixtures before enabling account, write or paid features.

This is a host plugin, not a standalone desktop app. Original README files may contain historical machine-specific test results; those results do not establish portability of this published snapshot.

## Provenance

The overview design references [SAOS-3624/dsh-video-storyboard](https://github.com/SAOS-3624/dsh-video-storyboard) (MIT). Local time partitioning, scene selection and evidence records are independently implemented; its runtime modules were not copied. The upstream license is included. See [upstream sources and changes](../../../docs/UPSTREAM.en.md).

Original third-party licenses and copyright notices are retained.
