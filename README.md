# Orbital — Product Engineering Take-Home

A document Q&A tool for commercial real estate lawyers. Upload a legal document
(lease, title report, environmental assessment) and ask questions about it.

📹 **Loom walkthrough:** _<add link>_

📝 **Part 1 (written question):** _<add markdown file>_

---

## My thinking

**What I chose to build and why.** I chose to build functionality to allow the upload
of multiple files in a chat ; and functionality whereby every factual claim in an answer
carries a citation the lawyer can check in one click that highlights the cited text in the original
document. I added the upload multiple files functionality because a commercial real estate lawyer's 
unit of work isn't one document - it's a deal that involves multiple documents, and different files
may contain relevant pieces of information with regard to a query the lawyer has on a deal. So being 
able to cross-reference a question against multiple files at once would be very useful for a lawyer.
I added the citation functionality because for due diligence checks, verifiability is of the utmost importance :
a lawyer needs to have confidence that the AI model's response to their questions is completely grounded in 
the relevant documents and isn't the model hallucinating. With the citation functionality, the model cites a document,
page and verbatim quote; the backend checks that quote against the actual text of the page it named; and clicking a citation
pill opens that document at that page and highlights the passage in the reader panel on the right. Quotes that don't verify
turn amber, so a fabricated citation is visible rather than trusted. This allows the lawyer to efficiently check the AI model's 
response against the citation so they can have a high level of certainty that the AI model's response is grounded in the documents.


**Why this over other options.** Alternatives that I considered building were an auto-extracted key terms panel that pulls out
key terms like parties, lease term, rent, review dates, break clauses etc. on upload ; and an export to report functionality that allows
the lawyer to export parts of the conversation they deem to be useful/important to a draft scaffold of a report that they can add 
further edits to. I chose to build citations over these two alternatives as both the key terms panel and export are ways of
presenting AI output : neither addresses whether the output can be trusted, and for due diligence, trust is the constraint that
matters most. A key terms panel gives you a confident table of facts, but if the lawyer can't check any cell, they have to verify
each one in the document anyway. And exporting is worse if built first: it takes unverified answers and puts them into something
that looks authoritative. So the citations were the highest priority item as they are what allow the lawyer to have trust in the 
AI model's responses. Furthermore, multi-document analysis is a key part of commercial real estate lawyers' work which is why I built
the functionality to allow the upload of multiple files in a chat : it makes a fundamental part of a commercial real estate lawyer's workflow
more streamlined.


**What I'd do next.** Now that citations are built, the two alternatives I mentioned above become cheaper, since locating a term, naming its
page and verifying the quote is the hard part - so I'd add functionality that allows a lawyer to export parts of the chat they find useful to a 
draft report and a key terms panel. I'd also add optical character recognition (OCR) to deal with scanned documents as scanned documents are
likely to be common and they currently extract no text at all, so nothing in them can be cited or verified. Finally, for a production
version of this, I'd add authentication and per-firm data isolation. These would 
be needed before a firm could put client documents near it.

### Smaller fixes to the existing app

- **Neither delete confirmed.** Deleting a conversation cascades to every document
  and message in it, so it now asks and names what will be lost; removing a single
  document uses a lighter inline confirm.
- **Chats couldn't be renamed**, though the `PATCH` endpoint existed and nothing
  called it. Titles were generated once from the first question, so a poor first
  question left a matter misnamed permanently. I added functionality to rename chats.


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
