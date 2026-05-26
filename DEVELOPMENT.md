# Development

## Setup

```bash
git clone https://github.com/realhenrylan/obsidian-with-kilocode.git
cd obsidian-kilocode
npm install
```

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Development mode with esbuild watch |
| `npm run build` | Production build |
| `npm test` | Run all Jest tests |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:coverage` | Run tests with coverage report |
| `npm run lint` | Run ESLint |
| `npm run lint:fix` | Fix ESLint errors automatically |
| `npm run typecheck` | TypeScript type check (`tsc --noEmit`) |

## Testing

- **Unit tests**: ProviderRegistry, StreamController, InputController, TabManager, ConversationService, MessageRenderer, CommandRegistry, PlanModeController, MCPManager, KiloCodeChatRuntime, i18n, ApprovalManager, ImageContext, CurrentNoteContext, InputToolbar
- **Integration tests**: Chat workflow (TabManager + StreamController + InputController + PlanModeController), conversation management (fork/rewind/compact/resume), streaming pipeline

```bash
npm test
npm run test:coverage
```

## i18n

Adding a new language:

1. Create `src/i18n/locales/{lang}.json` following the structure of `en.json`
2. The i18n system auto-detects the locale and falls back to `en` for missing keys
3. Translation keys use dot notation (e.g., `settings.cliPathDesc`) with `{{param}}` substitution

## CI/CD

- **CI** (`.github/workflows/ci.yml`): Runs on push/PR to main — typecheck → lint → build → test
- **Release** (`.github/workflows/release.yml`): On tag `v*` — build → create GitHub Release with `main.js`, `manifest.json`, `styles.css`
