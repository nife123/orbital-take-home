from __future__ import annotations

import re
from collections.abc import AsyncIterator

from pydantic import BaseModel
from pydantic_ai import Agent

from takehome.config import settings  # noqa: F401 — triggers ANTHROPIC_API_KEY export

# Answering is the accuracy-critical path: the model has to reproduce quotes
# verbatim for a citation to verify. Title generation doesn't, so it stays on
# the cheap model.
agent = Agent(
    "anthropic:claude-sonnet-4-5",
    system_prompt=(
        "You are a helpful legal document assistant for commercial real estate lawyers. "
        "You help lawyers review and understand documents during due diligence.\n\n"
        "IMPORTANT INSTRUCTIONS:\n"
        "- Answer questions based on the document content provided.\n"
        "- If the answer is not in the document, say so clearly. Do not fabricate information.\n"
        "- Be concise and precise. Lawyers value accuracy over verbosity.\n\n"
        "You may be given several documents covering the same deal — a lease, a title "
        "report, searches, an environmental assessment. Read all of them. The same "
        "restriction often appears in more than one document, and a restriction in one "
        "can survive independently of another: a restrictive covenant on the title binds "
        "regardless of what a lease permits. Point out those interactions explicitly — "
        "they are the easiest thing for a lawyer to miss.\n\n"
        "CITATIONS — this is the most important part of your job:\n"
        "- Every factual claim about a document MUST be immediately followed by a citation "
        "in exactly this format:\n"
        "    [[cite:DOC|PAGE|verbatim quote from that page]]\n"
        "- DOC is the `id` of the <document> the quote came from. PAGE is that document's "
        "own page number, from its `--- Page N ---` markers.\n"
        "- The quote must be copied EXACTLY, word for word, from the page you cite. "
        "Do not paraphrase, summarise, correct, or reformat it.\n"
        "- Keep quotes short — 5 to 15 words. Pick the most distinctive phrase.\n"
        "- Never cite a quote from one document against another document's id. Every "
        "citation is checked against the real text of the document and page you name, and "
        "shown to the user as verified or unverified, so a mismatch is visible immediately.\n"
        "- If the documents do not support a claim, do not cite anything. Say plainly that "
        "they do not address it. An uncited answer is far better than a false citation.\n\n"
        "Example (document 1 page 6, then document 2 page 2):\n"
        "Use is restricted to offices [[cite:1|6|as offices within Class E(g)(i)]], and a "
        "restrictive covenant separately prohibits trade "
        "[[cite:2|2|not to carry on any trade or business upon the land]]."
    ),
)

title_agent = Agent(
    "anthropic:claude-haiku-4-5-20251001",
    system_prompt=(
        "You write short, specific titles for legal document conversations. "
        "Return only the title, with no quotes, punctuation, or commentary."
    ),
)


class Citation(BaseModel):
    """A document- and page-anchored reference, checked against the real page text."""

    page: int
    quote: str
    verified: bool = False
    # Absent on citations saved before conversations could hold several documents.
    document_id: str | None = None
    document_name: str | None = None
    # Content digest of the cited document. A row id dies when a document is
    # deleted, but the same file re-uploaded has the same bytes — so the hash is
    # what lets a citation find its source again afterwards.
    document_hash: str | None = None


class DocumentContext(BaseModel):
    """One document as the model sees it: an index, a name, and its page text."""

    id: str
    name: str
    pages: dict[int, str]
    content_hash: str | None = None


# [[cite:DOC|PAGE|quote]] — DOC is the 1-based index shown to the model, not the id.
CITATION_RE = re.compile(r"\[\[cite:(\d+)\|(\d+)\|([^\]]+?)\]\]")

# The single-document format used before this feature. Still parsed so that pills
# in already-saved conversations keep rendering instead of reverting to raw text.
LEGACY_CITATION_RE = re.compile(r"\[\[cite:(\d+)\|([^\]|]+?)\]\]")

# PDF extraction and the model disagree about typography far more often than they
# disagree about substance, so both sides are flattened before comparison.
_TYPOGRAPHY = str.maketrans({"‘": "'", "’": "'", "“": '"', "”": '"',
                             "–": "-", "—": "-", "−": "-", " ": " "})


def _normalize(text: str) -> str:
    """Flatten whitespace, quote style, and case for quote matching."""
    return " ".join(text.translate(_TYPOGRAPHY).split()).casefold()


def parse_citations(
    response: str, documents: list[DocumentContext] | None = None
) -> list[Citation]:
    """Extract every citation token from a model response, in order.

    `documents` maps the 1-based index the model was shown back to the real
    document. Tokens naming an index that wasn't offered are kept but left
    unresolved, so they fail verification rather than vanishing silently.
    """
    by_index = dict(enumerate(documents or [], start=1))

    def build(doc: DocumentContext | None, page: str, quote: str) -> Citation:
        return Citation(
            page=int(page),
            quote=quote.strip(),
            document_id=doc.id if doc else None,
            document_name=doc.name if doc else None,
            document_hash=doc.content_hash if doc else None,
        )

    citations = [
        build(by_index.get(int(doc_index)), page, quote)
        for doc_index, page, quote in CITATION_RE.findall(response)
    ]
    if citations:
        return citations

    # Nothing in the current format — fall back to the pre-multi-document format.
    single = by_index.get(1)
    return [
        build(single, page, quote)
        for page, quote in LEGACY_CITATION_RE.findall(response)
    ]


def verify_citations(
    citations: list[Citation], documents: list[DocumentContext]
) -> list[Citation]:
    """Mark each citation verified if its quote appears on the page it cites.

    This is what makes a citation trustworthy rather than decorative: the model
    claims a source, and we check that claim against the extracted page text
    before showing it to a lawyer.

    With several documents in play, the new failure mode is attributing a real
    quote to the wrong file. Checking against the cited document specifically —
    rather than against all of them — is what catches that.
    """
    normalized = {
        doc.id: {page_no: _normalize(text) for page_no, text in doc.pages.items()}
        for doc in documents
    }
    for citation in citations:
        pages = normalized.get(citation.document_id or "", {})
        page_text = pages.get(citation.page, "")
        citation.verified = bool(page_text) and _normalize(citation.quote) in page_text
    return citations


async def generate_title(user_message: str) -> str:
    """Generate a 3-5 word conversation title from the first user message."""
    result = await title_agent.run(
        f"Generate a concise 3-5 word title for a conversation that starts with: '{user_message}'. "
        "Return only the title, nothing else."
    )
    title = str(result.output).strip().strip('"').strip("'")
    # Truncate if too long
    if len(title) > 100:
        title = title[:97] + "..."
    return title


async def chat_with_documents(
    user_message: str,
    documents: list[DocumentContext],
    conversation_history: list[dict[str, str]],
) -> AsyncIterator[str]:
    """Stream a response grounded in every document attached to the conversation.

    All documents share one context so the model can reason across them — the
    point being that a restriction in one document can override or duplicate a
    restriction in another. The cost is that context grows with the bundle.
    """
    # Build the full prompt with context
    prompt_parts: list[str] = []

    if documents:
        prompt_parts.append(
            f"The following {len(documents)} document(s) relate to this deal. "
            "Cite by the document id shown in each tag.\n"
        )
        for index, doc in enumerate(documents, start=1):
            body = "\n\n".join(
                f"--- Page {page_no} ---\n{text}" for page_no, text in sorted(doc.pages.items())
            )
            prompt_parts.append(
                f'<document id="{index}" name="{doc.name}">\n{body}\n</document>\n'
            )
    else:
        prompt_parts.append(
            "No documents have been uploaded yet. If the user asks about a document, "
            "let them know they need to upload one first.\n"
        )

    # Add conversation history
    if conversation_history:
        prompt_parts.append("Previous conversation:\n")
        for msg in conversation_history:
            role = msg["role"]
            content = msg["content"]
            if role == "user":
                prompt_parts.append(f"User: {content}\n")
            elif role == "assistant":
                # Past citation tokens are noise here, and replaying them invites
                # the model to copy stale page numbers instead of re-checking.
                prompt_parts.append(f"Assistant: {strip_citations(content)}\n")
        prompt_parts.append("\n")

    # Add the current user message
    prompt_parts.append(f"User: {user_message}")

    full_prompt = "\n".join(prompt_parts)

    async with agent.run_stream(full_prompt) as result:
        async for text in result.stream_text(delta=True):
            yield text


def strip_citations(response: str) -> str:
    """Remove citation tokens from a response, for use as plain conversation history."""
    return LEGACY_CITATION_RE.sub("", CITATION_RE.sub("", response))
