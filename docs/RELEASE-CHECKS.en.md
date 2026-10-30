# Release checks

[中文](发布检查.md) | English

Snapshot: 2026-10-30.

- Checked names, versions and entries of 15 plugin/configuration components; each has separate Chinese and English guides.
- Syntax checks passed for 328 JS/MJS/CJS files; Python AST parsing passed for 36 files. Full TS/TSX/JSX builds were not repeated.
- The local copy configurator passed an isolated smoke check: paths/session placeholders changed in the output; published source kept example configuration. Nothing was installed into production.
- Reviewed common credential formats, account/session identifiers, data files and cache directories. Runtime credential-reading code remains, credential values/files do not.
- SHA256SUMS.json supports local integrity verification with node tools/verify-release.mjs.

Packaging did not invoke paid models, send QQ/Bilibili test messages, modify production memory or redeploy installed plugins. Historical tests in original module documents are separate from these packaging checks.
