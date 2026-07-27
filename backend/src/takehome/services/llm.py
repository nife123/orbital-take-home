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
        "CITATIONS — this is the most important part of your job:\n"
        "- Every factual claim about the document MUST be immediately followed by a citation "
        "in exactly this format:\n"
        "    [[cite:PAGE|verbatim quote from that page]]\n"
        "- The quote must be copied EXACTLY, word for word, from the page you cite. "
        "Do not paraphrase, summarise, correct, or reformat it.\n"
        "- Keep quotes short — 5 to 15 words. Pick the most distinctive phrase.\n"
        "- Take PAGE from the `--- Page N ---` markers in the document.\n"
        "- Every citation is checked against the real page text and shown to the user as "
        "verified or unverified, so a fabricated quote will be visible immediately.\n"
        "- If the document does not support a claim, do not cite anything. Say plainly that "
        "the document does not address it. An uncited answer is far better than a false citation.\n\n"
        "Example:\n"
        "The permitted use is restricted to offices [[cite:4|as offices within Class E(g)(i)]]."
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
    """A page-anchored reference emitted by the model and checked against the document."""

    page: int
    quote: str
    verified: bool = False


CITATION_RE = re.compile(r"\[\[cite:(\d+)\|([^\]]+?)\]\]")

# PDF extraction and the model disagree about typography far more often than they
# disagree about substance, so both sides are flattened before comparison.
_TYPOGRAPHY = str.maketrans({"‘": "'", "’": "'", "“": '"', "”": '"',
                             "–": "-", "—": "-", "−": "-", " ": " "})


def _normalize(text: str) -> str:
    """Flatten whitespace, quote style, and case for quote matching."""
    return " ".join(text.translate(_TYPOGRAPHY).split()).casefold()


def parse_citations(response: str) -> list[Citation]:
    """Extract every `[[cite:PAGE|quote]]` token from a model response, in order."""
    return [
        Citation(page=int(page), quote=quote.strip())
        for page, quote in CITATION_RE.findall(response)
    ]


def verify_citations(citations: list[Citation], pages: dict[int, str]) -> list[Citation]:
    """Mark each citation verified if its quote really appears on the page it cites.

    This is what makes the citation trustworthy rather than decorative: the model
    claims a source, and we check the claim against the extracted page text before
    showing it to a lawyer.
    """
    normalized_pages = {page_no: _normalize(text) for page_no, text in pages.items()}
    for citation in citations:
        page_text = normalized_pages.get(citation.page, "")
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


async def chat_with_document(
    user_message: str,
    document_text: str | None,
    conversation_history: list[dict[str, str]],
) -> AsyncIterator[str]:
    """Stream a response to the user's message, yielding text chunks.

    Builds a prompt that includes document context and conversation history,
    then streams the response from the LLM.
    """
    # Build the full prompt with context
    prompt_parts: list[str] = []

    # Add document context if available
    if document_text:
        prompt_parts.append(
            "The following is the content of the document being discussed:\n\n"
            "<document>\n"
            f"{document_text}\n"
            "</document>\n"
        )
    else:
        prompt_parts.append(
            "No document has been uploaded yet. If the user asks about a document, "
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
    return CITATION_RE.sub("", response)
