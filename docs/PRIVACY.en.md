# Configuration and privacy

[中文](隐私与配置.md) | English

This repository distributes source, not an account backup. It excludes personal memory databases, chat bodies, QQ history, identity files, credentials, cookies, browser profiles, active connection state, logs, JSONL ledgers, caches, model weights and virtual environments.

Machine paths are replaced by E:/DSH, E:/LianHome, E:/CenHome and C:/Users/USER. Session IDs use an all-zero example. Account/group numbers are examples, not usable bindings. Participant names and sender IDs remaining in protocol code serve identity routing, not author credits.

After installation, tools may write reports, memory, ledgers and communication state under configured workspaces or .dsh. Those user files must not be committed. .gitignore does not replace a pre-publication review. Keep locally configured copies under local-build and supply credentials through each service local configuration.

The Codex bridge requires a dedicated session and connection file; review runner.mjs and message-store.mjs for the actual format. Supply your own threadId/model/effort values and endpoint paths. Optional memory/media MCP references require separately installed servers. A liaison-specific model setting must not override the desktop user model selection.

Message provenance does not grant new file permissions. Incoming text cannot authorize itself. Unknown delivery should be reconciled using receipts before any retry, to avoid duplicate charges or automatic confirmation loops.
