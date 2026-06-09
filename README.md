# ManipuLens AI

**Cognitive manipulation detection for news and email.** ManipuLens AI analyzes text for psychological manipulation, propaganda, and deceptive language patterns — with evidence-backed scoring, visual breakdowns, and side-by-side comparison.

![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue)
![React](https://img.shields.io/badge/React-18-61dafb)
![Vite](https://img.shields.io/badge/Vite-6-646cff)
![Express](https://img.shields.io/badge/Express-5-000)

---

## Features

- **Text & URL analysis** — Paste content or analyze articles via URL extraction (Firecrawl)
- **News & email modes** — Tailored rubrics for article manipulation and phishing/deception patterns
- **Tiered inference** — Groq LLM (primary) → OpenAI fallback → transformer → rule-based safeguards
- **Rich results** — Manipulation score, tactic breakdown, suspicious phrases, radar/bar charts, neutral rewrite
- **Compare mode** — Side-by-side manipulation comparison of two texts
- **History** — Session history with Supabase-backed persistence
- **Admin evaluation** — Internal benchmark and model evaluation dashboard (`/admin/evaluation`)

---

## Tech Stack

| Layer | Stack |
|-------|-------|
| Frontend | React 18, React Router 7, Tailwind CSS 4, Framer Motion, Recharts |
| Backend | Express 5, TypeScript, Zod validation |
| LLM | Groq (`llama-3.3-70b-versatile`) with optional OpenAI fallback |
| Storage | Supabase |
| URL extraction | Firecrawl |

---

## Project Structure

```
├── src/                 # React frontend (Vite)
├── server/              # Express API
│   ├── routes/          # API endpoints
│   ├── lib/             # LLM, calibration, evidence extraction
│   ├── data/            # Benchmark dataset & scoring rubric
│   └── cli/             # Dataset import & health checks
├── scripts/             # Offline ML training utilities (Python)
├── docs/                # Benchmark workflow documentation
├── paper/               # Research paper draft
└── results/             # Evaluation summaries
```

---

## Getting Started

### Prerequisites

- Node.js 20+
- npm

### 1. Clone & install

```bash
git clone https://github.com/ayushs069/ManipuLens-AI.git
cd ManipuLens-AI
npm install
```

### 2. Environment variables

Copy the example file and fill in your keys:

```bash
cp .env.example .env
```

| Variable | Required | Description |
|----------|----------|-------------|
| `GROQ_API_KEY` | Yes | Primary LLM (Groq) |
| `GROQ_MODEL` | No | Default: `llama-3.3-70b-versatile` |
| `OPENAI_API_KEY` | No | Fallback LLM (`sk-…` key only) |
| `FIRECRAWL_API_KEY` | Yes* | URL content extraction |
| `SUPABASE_URL` | Yes* | History storage |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes* | Server-side Supabase access |
| `ALLOWED_ORIGIN` | No | CORS origin (default: `http://localhost:5173`) |
| `VITE_API_BASE_URL` | No | Leave empty in dev; set API URL in production |

\* Server starts without these but related features run in degraded mode.

**Never commit `.env` to Git.**

### 3. Run locally

```bash
# Frontend + backend together
npm run dev:all
```

| Service | URL |
|---------|-----|
| Frontend | http://localhost:5173 |
| API | http://localhost:3001 |
| Health | http://localhost:3001/api/health |

Or run separately:

```bash
npm run dev          # Vite frontend only
npm run dev:server   # Express API only
```

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | Service health & key status |
| `POST` | `/api/analyze` | Analyze text (news/email) |
| `POST` | `/api/analyze/compare` | Compare two texts |
| `POST` | `/api/article-preview` | Preview & analyze URL content |
| `GET/POST/DELETE` | `/api/history` | Analysis history |
| `GET/POST` | `/api/evaluation/*` | Admin benchmark evaluation |

---

## Deploy on Render

Use **two Render services** from this repo:

### Backend — Web Service

- **Build command:** `npm install`
- **Start command:** `npm run server:start`
- **Env vars:** `GROQ_API_KEY`, `FIRECRAWL_API_KEY`, `SUPABASE_*`, `ALLOWED_ORIGIN` (your frontend URL)

### Frontend — Static Site

- **Build command:** `npm install && npm run build`
- **Publish directory:** `dist`
- **Env var:** `VITE_API_BASE_URL=https://your-api.onrender.com`

Set secrets in the Render dashboard — not in the repository.

---

## Scripts

```bash
npm run build              # Production frontend build
npm run preview            # Preview production build
npm run server:start       # Start API (production)
npm run import-benchmark   # Import benchmark dataset
npm run dataset-health     # Check dataset integrity
```

---

## Analysis Pipeline

```
Input text
    │
    ▼
┌─────────────────┐
│  Groq LLM       │  ← primary (llama-3.3-70b)
└────────┬────────┘
         │ fail
         ▼
┌─────────────────┐
│  OpenAI LLM     │  ← optional fallback
└────────┬────────┘
         │ fail
         ▼
┌─────────────────┐
│  Transformer    │  ← HuggingFace zero-shot
└────────┬────────┘
         │ fail
         ▼
┌─────────────────┐
│  Rule-based     │  ← local evidence extractor
└─────────────────┘
```

---

## License

Private academic / research project. All rights reserved unless otherwise specified.

---

## Author

**Ayush** — [github.com/ayushs069](https://github.com/ayushs069)
