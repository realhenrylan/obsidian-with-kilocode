# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [0.1.0] - 2026-05-20

### Added

- **Project initialization**: package.json, tsconfig.json, esbuild.config.mjs, manifest.json, .gitignore
- **Core type definitions**: ProviderId, Conversation, Message, ToolCallInfo, StreamMessage, KiloCodeSettings
- **Provider registry**: ProviderRegistry static class for managing AI providers
- **KiloCode provider**: capabilities, settings, models, ChatRuntime (JSON-RPC over stdio), registration
- **Plugin entry point**: KiloCodePlugin class with settings management, view registration, ribbon icon, commands
- **StreamController**: streaming response handler with text/tool/error callbacks
- **Build verification**: TypeScript type checking and esbuild production build both pass

### Fixed

- Moved @codemirror packages from dependencies to devDependencies (externalized by esbuild)
- Removed importHelpers from tsconfig (not needed with esbuild)
- Added esModuleInterop and forceConsistentCasingInFileNames to tsconfig
- Buffered partial stdout lines in KiloCodeChatRuntime to prevent JSON parse failures
- Removed shell:true from spawn options to prevent command injection
- Placeholder KiloCodeView/KiloCodeSettingTab now extend proper Obsidian base classes
