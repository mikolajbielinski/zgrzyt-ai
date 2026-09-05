# frontend

Chat interface for zgrzyt-ai. Everything about the pipeline behind it is in the
[root README](../README.md) — this file only covers the UI.

React 19 + Vite + Tailwind 4, built to static files and served by nginx.

## Structure

```
src/
  App.tsx              conversation state; calls /api/ask and /api/limits
  components/
    ChatWindow.tsx     message list
    InputArea.tsx      composer, enforces the length limit locally
    Message.tsx        renders one message; answers go through react-markdown
    SourceCard.tsx     the episode + timestamp links returned with an answer
    TypingIndicator.tsx
  types/index.ts
```

## Development

```bash
bun ci
bun run dev     # Vite dev server, expects the backend on the proxy target
bun run build   # -> dist/
bun run lint
```
