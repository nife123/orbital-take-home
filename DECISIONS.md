# Decisions

## What I built: citations you can actually check

The baseline app told lawyers how many sources an answer cited. That number was a lie. `sources_cited` was computed by regexing the model's own prose for `section \d+`, `clause \d+`, `page \d+` — it counted what the model *said*, not what the model *checked*. The counter went **up** when the model hallucinated a clause number, so its confidence signal peaked exactly when the answer was wrong. Meanwhile the PDF panel on the right was decorative: the model said "Clause 14.3" and the lawyer scrolled to find it by hand.

So I made citations real. The model now emits an inline `[[cite:PAGE|verbatim quote]]` token after every factual claim. The backend splits the extracted text back into pages, checks each quote actually appears on the page it cites, and stores the result. Verified citations render as quiet inline pills; clicking one jumps the reader to that page and highlights the exact passage. A quote the backend *couldn't* find turns amber with a warning — and that path fires in practice, not just in theory: in testing the model cited a service-charge figure to page 4 when it wasn't there, and the UI flagged it while the other eight citations passed. `sources_cited` is now a count of verified references.

## Why this over the alternatives

For a lawyer, an unverifiable answer is worthless — checking it by hand costs the same as not using the tool, so an AI answer they can't trace is a rounding error on their day. Trust is the entire product problem in this domain, and everything else is downstream of it. I also deliberately picked a change that made the *existing* parts work together rather than bolting a fourth panel onto the screen: the reader stops being decoration and becomes the verification surface.

The strongest alternative was **multi-document conversations** — the brief mentions "dozens of documents per deal," and one-document-per-conversation is a real structural limit. I passed on it because it's mostly plumbing (schema, upload UI, switcher, prompt assembly), it's the least visible of the options, and it pushes straight into context-window problems that need chunking and retrieval to solve honestly — not a 2-3 hour job. Shipping it half-done would have produced something that looked broader and worked worse. I also considered an auto-extracted key-terms panel, which demos well but doesn't fix the trust problem underneath.

Two implementation choices worth naming. I used **inline tokens rather than PydanticAI structured output** because structured output would either buffer the whole answer or need partial-object streaming, and it loses the positional link between a claim and its source — a citation belongs next to the sentence it supports. And I moved the answering model from Haiku to **Sonnet**, keeping Haiku for title generation: verbatim quoting is precisely where a small model fails, and the verification badge makes those failures visible to the user rather than silent.

## What I'd do next

**Multi-document matters** first — Matter → many Documents → many Threads, which is how due diligence is actually filed and what unlocks cross-document questions ("does the permitted use conflict with the title restriction?"). That needs **retrieval** underneath it, which the current design has no answer for: today the entire document text goes into every prompt, so a long lease bundle will blow the context window with no chunking and no truncation. Citations make retrieval easier to build, since page anchors are already first-class.

Then: **abstention pressure** — the model should be scored on refusing to answer when the document is silent, and I'd want an eval set of lease questions with known answers to measure citation precision rather than eyeballing it. **OCR**, because scanned title reports are everywhere and today PyMuPDF returns nothing and the assistant then claims no document was uploaded — a confusing lie about a file the user is looking at. **Export** to Word, since the lawyer's actual deliverable is a report, not a chat log. And **auth and tenancy**, which is table stakes before any firm puts client-confidential documents near this.

## Existing behaviour I changed

- **Deleted `count_sources_cited`** — the regex described above. Replaced with verified citation counting.
- **Answering model Haiku → Sonnet**, for the quoting-accuracy reason above. Titles stay on Haiku.
- **Streaming error path** (`messages.py`): the old code overwrote the response with an error string, so text already on the user's screen was discarded and vanished when the client refetched. It now appends, keeping the saved message consistent with what was displayed.
- **Past citation tokens are stripped from conversation history** before being replayed to the model, so it re-checks the document instead of copying stale page numbers.
- Fixed pre-existing lint failures (`B904`, import ordering) so `just check` runs clean.

## Known limitations

- Highlighting works at PDF text-item granularity, so a match can spill a few words past the quote at the boundary. Erring toward slightly-too-much beats missing the passage.
- Verification is a normalised substring check — it confirms the quote exists on the cited page, not that it supports the claim. It catches fabrication, not misreading.
- Citations are checked against extracted text, so a scanned page yields no verifiable citations at all.
