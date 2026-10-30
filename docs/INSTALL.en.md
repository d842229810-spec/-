# Installation

[中文](安装指南.md) | English

## Supported baseline

This snapshot was assembled from Windows / DeepSeek Harness 0.2.1-rc.3. Prepare Node.js 24, Python 3.11/3.12 and Git as applicable. Desktop control needs an interactive Windows session. Video tools also require FFmpeg/FFprobe and their rendering dependencies.

## Download and verify

~~~powershell
git clone https://github.com/d842229810-spec/-.git lian-plugins
cd lian-plugins
node tools/verify-release.mjs
~~~

## Configure a separate local copy

Published paths are examples: E:/DSH is the Harness installation, E:/LianHome the assistant workspace, E:/CenHome the Codex liaison workspace, and C:/Users/USER an example user directory. All-zero session IDs are placeholders, not working session bindings.

~~~powershell
node tools/configure.mjs --output ./local-build --harness-root "E:/DSH" --lian-home "E:/LianHome" --cen-home "E:/CenHome"
~~~

The output must be a new directory. The script copies files and substitutes paths only; it does not modify production plugins/profiles, install dependencies or start services. Use your actual paths. Add --user-home for the user directory and --owner-session for a real owner session where required. Otherwise placeholders remain. Never upload the resulting private configuration.

## Install selected dependencies

See DEPENDENCIES.en.md. Retain the nested harness-plugins directory layout and the 扩展 subdirectory because modules share relative imports. In lian-video-runtime, npm ci installs dependencies fixed by package-lock.json. Create separate Python environments using the relevant requirements files. Install models and third-party applications separately.

## Register with Harness

Back up plugins, profile and data; stop related writers. Start with a separate test profile. Place generated components in their configured locations. If the exact target CLI supports local file packages, an example is:

~~~powershell
dsh plugin --profile desktop add "@local/lian-continuity@file:E:/DSH/插件/扩展/lian-continuity"
~~~

Adjust the package, directory and profile. This command was not executed again during repository packaging. Use the CLI matching the running desktop app, not an older dsh on PATH.

Inspect package.json and cordis.patch.yml. Some packages do not have a standard bundle patch: workspace UI modules require host client services, the manager needs explicit setup, and the liaison needs a connection file and a dedicated session. There is no universal install command for every component.

Cordis patch name is a matching condition, not a replacement module path. Replacing disk files does not prove the running process loaded them; restart/reload and check the actual entry/version because ESM caches may retain old code.

## Validate and roll back

Check loader errors, versions and actual schemas. Use read-only status tools and synthetic fixtures first, then separately configure accounts and paid features. This snapshot does not provide a universal installer, automatic model downloads, cross-version SDK adaptation or QQ login.

To roll back, stop relevant writers, restore plugin/profile backups and verify after restart. Never overwrite live chats, memory or ledgers with the source repository or silently replace newer data with an old backup.
