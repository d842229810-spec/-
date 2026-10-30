# Beginner's glossary

[中文](新手术语表.md)

| Term | Plain-language explanation |
| --- | --- |
| DeepSeek Harness / host | The main application that runs the assistant and its plugins. Plugins need a compatible host version. |
| Plugin | A set of code that adds a capability to the host, such as memory search or QQ connection; most need the host to run. |
| Workspace | The folder used by a task. Reading or changing files still depends on permissions and configuration. |
| Runtime | Programs and dependencies needed for a capability, such as Node.js, Python or a renderer; it does not imply models have been downloaded. |
| Node.js / Python | Environments that run plugin scripts. A plugin may require one or both. |
| MCP | A protocol for assistants to communicate with tools or services. An interface still needs its service installed and started. |
| API | An agreed way for programs to call each other. Network APIs may require an account, key or payment according to their provider. |
| SDK | Developer tools and interfaces for a platform or application. Wrong host SDK paths or versions can prevent a plugin from loading. |
| Tool schema | The input fields and formats a tool accepts. Use the schema shown by the running tool. |
| Codex liaison session | A separate Codex conversation for communication between endpoints; it requires configuration and does not automatically share the desktop chat context. |
| OneBot | An interface convention for exchanging messages between a QQ backend and a plugin. A compatible backend must be installed and logged in separately. |
| QQ receipt | A record of a message processing or delivery stage; success at one stage does not necessarily mean the recipient saw it. |
| Remotion | A tool for describing video frames with React code and rendering them as video. |
| Motion Canvas | A code-based vector animation tool suited to shapes, text and formulas. |
| FFmpeg / FFprobe | Command-line media processing and inspection programs used for tasks such as conversion, frame extraction and reading duration. |
| OCR | Recognizing text in an image or video frame; results may contain errors. |
| ASR | Automatic speech recognition: converting audio to text; words may be missed or misheard. |
| Local model / weights | A local model runs on your device; its weights are data files needed to run it. Plugin source does not necessarily include either. |
| Token | A unit used to measure model input/output, not a fixed number of characters. Cost depends on the model and provider. |
| Budget reservation | Temporarily setting aside estimated cost before a request, then settling when reliable usage arrives; it applies only to integrated calls. |
| MIT license | An open-source license allowing use, modification and distribution subject to conditions including retaining copyright and permission notices. Consult the original license for each project. |
| Git / repository | Git records file versions; a repository holds a project's version history. GitHub can host repositories. |
| CLI | Command-line interface: operating a program through typed commands. Commands may vary by version. |
