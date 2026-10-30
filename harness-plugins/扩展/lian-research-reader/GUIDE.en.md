# Web and document reader

[中文](使用指南.md) | English

Package: `@local/lian-research-reader` · Version: `1.0.1`.

## Features

Helps the assistant read public webpages, PDFs and image material while retaining traceable sources, useful for research or checking a document.

## When to use it

For example, provide a public article or PDF and ask for key points with sources. Web extraction and image recognition can be wrong, so check important claims against the original. Network/file access requires authorization.

## Requirements and limitations

Python and requirements.txt dependencies. Network/file actions still require user authorization.

## Entry points

`whale_research_read`

Use the schemas exposed by the running host and the skill documents in this directory. A tool mentioned in source code is not necessarily registered by this component.

## Setup

Read the repository [installation guide](../../../docs/INSTALL.en.md). Generate a separate local path-configured copy; retain the plugin directory layout. Check package.json and any cordis.patch.yml before registering the package in a compatible, isolated Harness profile. Restart/reload and verify the actual entry, version and tool definitions. Start with read-only status checks or synthetic fixtures before enabling account, write or paid features.

This is a host plugin, not a standalone desktop app. Original README files may contain historical machine-specific test results; those results do not establish portability of this published snapshot.

## Provenance

Local research adapter.

Original third-party licenses and copyright notices are retained.
