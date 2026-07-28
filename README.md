# Orbital — Product Engineering Take-Home

A document Q&A tool for commercial real estate lawyers. Upload a legal document
(lease, title report, environmental assessment) and ask questions about it.

## What I added: verifiable citations, across every document in a deal

The baseline app reported how many sources an answer cited, but the number was a
regex over the model's own prose — it counted the model *saying* "clause 14", so
it went up when the model hallucinated. Nothing connected an answer to the
document sitting in the reader panel. And a conversation could hold only one
document, while a lawyer's unit of work is a *deal* carrying dozens.

Now every factual claim carries a citation the lawyer can check in one click:

- **The model cites a document, a page, and a verbatim quote** for each claim.
- **The backend verifies every quote** against the real text of the page it cites,
  in the document it named.
- **Verified citations render as inline pills** — `Title Report · p.2`. Clicking
  one opens that document at that page and highlights the exact passage.
- **Unverified quotes turn amber with a warning** — if the model cites something
  that isn't where it claimed, the lawyer sees it immediately instead of taking
  it on trust.
- **Upload the whole deal at once.** Ask *"can the premises be used as a
  restaurant?"* and the answer surfaces both the lease's Class E(g)(i)
  restriction and the 1952 restrictive covenant on the title that binds
  regardless — the one a lawyer reading only the lease would miss.
- `sources_cited` now counts *verified* references.

📹 **Loom walkthrough:** _<add link>_

📄 **Reasoning and trade-offs:** [DECISIONS.md](DECISIONS.md)

📝 **Part 1 (written question):** _<add markdown file>_

---

## Setup

### Prerequisites
- Docker and Docker Compose
- just (command runner) — install via `brew install just` or `cargo install just`

That's it. Everything else runs inside containers.

### Getting Started

1. Clone this repository

2. Run the setup command:
```
just setup
```
   This copies `.env.example` to `.env` and builds the Docker images.

3. Add your Anthropic API key to `.env`:
```
ANTHROPIC_API_KEY=your_key_here
```
   We've provided an API key in the task email. You can also use your own.

4. Start everything:
```
just dev
```
   This starts PostgreSQL, the FastAPI backend (port 8000), and the React frontend (port 5173).
   Database migrations run automatically when the backend starts — no separate step needed.

5. Open http://localhost:5173 in your browser.

Your local `backend/src/` and `frontend/src/` directories are mounted into the containers —
edit files normally on your machine and changes hot-reload automatically.

### Sample Documents

We've included sample legal documents in `sample-docs/` for testing.

### Project Structure

- `frontend/` — React frontend (Vite + Tailwind + shadcn/Radix UI)
- `backend/` — FastAPI backend (Python 3.12 + SQLAlchemy + PydanticAI)
- `alembic/` — Database migrations
- `sample-docs/` — Sample PDF documents for testing

### Useful Commands

- `just dev` — Start full stack (Postgres + backend + frontend)
- `just stop` — Stop all services
- `just reset` — Stop everything and clear database
- `just check` — Run all linters and type checks
- `just fmt` — Format all code
- `just db-init` — Run database migrations
- `just db-shell` — Open a psql shell
- `just shell-backend` — Shell into backend container
- `just logs-backend` — Tail backend logs
