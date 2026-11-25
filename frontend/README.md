# TurtleTalk frontend

React + TypeScript + Vite. This is the original TurtleTalk app from
[project-languages](https://github.com/Jenishai5/project-languages), now connected to the FastAPI backend in this repo.

## Design

All styling has been removed so the design can be rebuilt from scratch: no CSS files, no Tailwind, no `className` or `style` attributes, no theme switcher. Pages and logic are unchanged and work as plain HTML.

State that used to be shown only with colour is kept as attributes, so a new stylesheet can target it:

| Attribute | Where | Values |
|---|---|---|
| `data-state` | Match / Picture options, word-match buttons, feedback messages, training buttons | `idle`, `selected`, `correct`, `wrong`, `muted`, `done`, `todo` |
| `aria-pressed` | Selected word in Match, auth tabs, translation language buttons | `true` / `false` |
| `aria-current="step"` | Current sentence in the sentence-shuffle navigation | — |
| `data-word-type` | Sentence tiles and legend | `noun`, `verb`, `adjective`, … |
| `data-variant`, `data-size` | `Button` component | `primary`, `secondary`, `dark`, `ghost` / `sm`, `md`, `lg` |

Progress in the sentence game is a native `<progress>` element, and modals have `role="dialog"`.

## Run it

The backend must be running first (`make api` in the repo root, port 8000).

```bash
cp .env.example .env
npm install
npm run dev
```

Open http://localhost:5173.

## How it talks to the backend

The app calls `/api/...`. Vite's dev server forwards those calls to FastAPI and drops the `/api` prefix
(see `vite.config.ts`):

| Frontend calls | FastAPI receives |
|---|---|
| `/api/game/sentences` | `/game/sentences` |
| `/api/game/wordmatch?language=en-es` | `/game/wordmatch?language=en-es` |
| `/api/progress/sentence` | `/progress/sentence` |

Login still uses Supabase Auth in the browser. The backend checks the Supabase token before saving progress.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Development server with hot reload |
| `npm run build` | Type-check and build for production |
| `npm test` | Run the tests (Vitest) |
