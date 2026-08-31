# speakers

The manual step in the zgrzyt-ai pipeline. See the [root README](../README.md) for how the rest
of it fits together.

WhisperX can tell that two different people are talking, but not who they are — it emits
`SPEAKER_00` and `SPEAKER_01`. Deciding which is which means listening to the episode, so this
is a deliberate human gate rather than a heuristic: nothing gets embedded until it has been
through here.

The app shows the next unlabelled transcript with a few sample utterances per anonymous speaker,
takes the names, and writes the result out. Reads `transcripts/raw/`, writes
`transcripts/labeled/`. Its IAM user can do exactly those two things and nothing else — not even
delete.

Next.js 16 (App Router, `output: standalone`) + React 19 + Tailwind 4, AWS SDK v3.

## Routes

| Route | Purpose |
|---|---|
| `POST /api/login` | checks credentials, sets the session cookie |
| `GET /api/auth/check` | is this session still valid |
| `GET /api/progress` | how many episodes are done vs pending — two `ListObjectsV2` calls
| `GET /api/files/next` | the next unlabelled transcript plus per-speaker examples |
| `PUT /api/files/[id]` | writes the labelled transcript to `labeled/` |

## Authentication

There are two independent layers, and only the outer one is doing real work:

1. **HTTP Basic Auth in `proxy.ts`**, matching every path except Next.js static assets. This is
   what actually protects the app.
2. **An application session cookie** set by `/api/login`. The token is `base64(secret:user)` and
   the API routes only check that the cookie is *present*, not that it is valid.

Layer 2 is weak and known to be weak. Do not remove the Basic Auth in front of it. The real fix
is an identity proxy (Cloudflare Access or similar), not more cookie logic.

## Environment

All of these are required, and the app **refuses to start** if any is missing rather than
falling back to a default — see `lib/env.ts`:

```
BASIC_AUTH_USER, BASIC_AUTH_PASS     outer Basic Auth
APP_USER, APP_PASS, APP_SECRET       application login
AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
S3_BUCKET
```

Optional, with sensible defaults: `AWS_REGION` (`eu-central-1`), `S3_PREFIX_RAW`
(`transcripts/raw/`), `S3_PREFIX_LABELED` (`transcripts/labeled/`).

## Development

```bash
npm ci
npm run dev
npm run lint
```
