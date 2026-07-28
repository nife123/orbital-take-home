# Decisions

## What I built: citations you can actually check

The baseline app told lawyers how many sources an answer cited. That number was a lie. `sources_cited` was computed by regexing the model's own prose for `section \d+`, `clause \d+`, `page \d+` — it counted what the model *said*, not what the model *checked*. The counter went **up** when the model hallucinated a clause number, so its confidence signal peaked exactly when the answer was wrong. Meanwhile the PDF panel on the right was decorative: the model said "Clause 14.3" and the lawyer scrolled to find it by hand.

So I made citations real. The model now emits an inline `[[cite:PAGE|verbatim quote]]` token after every factual claim. The backend splits the extracted text back into pages, checks each quote actually appears on the page it cites, and stores the result. Verified citations render as quiet inline pills; clicking one jumps the reader to that page and highlights the exact passage. A quote the backend *couldn't* find turns amber with a warning — and that path fires in practice, not just in theory: in testing the model cited a service-charge figure to page 4 when it wasn't there, and the UI flagged it while the other eight citations passed. `sources_cited` is now a count of verified references.

## Why this over the alternatives

For a lawyer, an unverifiable answer is worthless — checking it by hand costs the same as not using the tool, so an AI answer they can't trace is a rounding error on their day. Trust is the entire product problem in this domain, and everything else is downstream of it. I also deliberately picked a change that made the *existing* parts work together rather than bolting a fourth panel onto the screen: the reader stops being decoration and becomes the verification surface.

The strongest alternative was **multi-document conversations** — the brief mentions "dozens of documents per deal," and one-document-per-conversation is a real structural limit. I passed on it because it's mostly plumbing (schema, upload UI, switcher, prompt assembly), it's the least visible of the options, and it pushes straight into context-window problems that need chunking and retrieval to solve honestly — not a 2-3 hour job. Shipping it half-done would have produced something that looked broader and worked worse. I also considered an auto-extracted key-terms panel, which demos well but doesn't fix the trust problem underneath.

Two implementation choices worth naming. I used **inline tokens rather than PydanticAI structured output** because structured output would either buffer the whole answer or need partial-object streaming, and it loses the positional link between a claim and its source — a citation belongs next to the sentence it supports. And I moved the answering model from Haiku to **Sonnet**, keeping Haiku for title generation: verbatim quoting is precisely where a small model fails, and the verification badge makes those failures visible to the user rather than silent.

## Then: many documents per deal

A lawyer's unit of work isn't a document, it's a **deal** — one transaction carrying the lease, the title report, searches, an environmental assessment. The baseline allowed one document per conversation, so the app modelled the wrong unit.

The value here isn't "search everything because the lawyer doesn't know where to look" — they usually do know the break clause is in the lease. It's that **the same restriction can live in several documents independently**. Ask whether the premises can be used as a restaurant and the answer cites the lease's Class E(g)(i) restriction *and* a 1952 restrictive covenant on the title that binds regardless of what the landlord agreed. A lawyer reading only the lease misses the covenant. The same shape covers a side letter or deed of variation quietly overriding the main lease, and proving a term is absent across a whole bundle.

Citation tokens gained a document axis (`[[cite:DOC|PAGE|quote]]`), so a pill reads `Title Report · p.2` and clicking it switches the reader to that document *and* page. Verification checks the quote against the **cited document specifically** — attributing a real quote to the wrong file is the failure mode multi-document introduces, and checking against all documents at once would have hidden it.

**The trade-off I chose, and the one I didn't.** All documents share a single context, which is what buys cross-document reasoning — and it means context grows with the bundle. Many documents *of the same type* (fifteen leases in a multi-let building) want the opposite architecture: one call per document, returning a table, because independent leases have nothing to synthesise and one context window won't hold them. These are complementary query modes, not successive improvements — fan-out would scale but would lose exactly the cross-document insight above. The natural end state is both, exposed as **Ask** and **Compare**, named for the question shape rather than the architecture. I built Ask because the sample set is three different document types, where the whole value is the interaction between them.

## What I'd do next

**Retrieval**, which the current design has no answer for: the entire text of every document goes into every prompt, with no chunking and no truncation, so a real bundle will blow the context window. Page anchors already being first-class makes this easier to add.

Then: **abstention pressure** — the model should be scored on refusing to answer when the document is silent, and I'd want an eval set of lease questions with known answers to measure citation precision rather than eyeballing it. **OCR**, because scanned title reports are everywhere and today PyMuPDF returns nothing and the assistant then claims no document was uploaded — a confusing lie about a file the user is looking at. **Export** to Word, since the lawyer's actual deliverable is a report, not a chat log. And **auth and tenancy**, which is table stakes before any firm puts client-confidential documents near this.

## Existing behaviour I changed

- **Deleted `count_sources_cited`** — the regex described above. Replaced with verified citation counting.
- **Removed the one-document-per-conversation limit.** This also retired a latent 500: the old accessor used `scalar_one_or_none()`, which raises `MultipleResultsFound` the moment a second row exists — the check-then-insert guarding it had no unique constraint behind it, so two concurrent uploads would have poisoned the conversation permanently. Making many documents legal removed the bug rather than needing a constraint.
- **Byte-identical uploads are rejected (409), and documents can be deleted.** Lifting the one-document limit made duplicate uploads silently possible — three copies of the same lease meant 3× the context for no extra information, an unreadable picker showing three identical rows, and no way to undo it. Dedupe is on a **SHA-256 of the content, not the filename**: a data room routinely holds a different `Lease.pdf` in every tenant folder, and those must all be uploadable. Enforced with a unique constraint on `(conversation_id, content_hash)` rather than a bare pre-check, since a pre-check alone loses the race between concurrent uploads — the same flaw described above.

  A duplicate is reported as a **neutral notice, not an error**. The user's intent — have this document in the deal — is already satisfied, there is no corrective action to take, and dragging a folder containing one already-present file is routine. Red would frame normal behaviour as a mistake. Genuine failures (oversized file, not a PDF) stay red, because there the document really isn't in the deal and the user has to act. Distinguishing them meant giving the API client an error type that carries the status, so callers can tell a 409 from a 400.

  The content hash earns its keep twice. Because a deleted-and-re-uploaded file gets a fresh row id, a citation matching on id alone would keep reporting its source as removed while that source sat in the list. Citations therefore carry the hash as well, and resolve **id first, hash as fallback** — so re-adding a document silently re-links every citation that pointed at it. A *different* file uploaded under the cited filename correctly stays unlinked, which name matching would have got wrong.

  Surfacing errors at all exposed a pre-existing gap: `App.tsx` never read the error from the documents hook, so *every* upload failure — oversized, wrong type, network — was caught, stored and silently discarded. Uploads simply appeared to do nothing. Upload outcomes are now shown in both the empty and populated conversation states, and API errors unwrap FastAPI's `detail` instead of showing users `API error 409: {"detail":…}`.
- **Answering model Haiku → Sonnet**, for the quoting-accuracy reason above. Titles stay on Haiku.
- **Streaming error path** (`messages.py`): the old code overwrote the response with an error string, so text already on the user's screen was discarded and vanished when the client refetched. It now appends, keeping the saved message consistent with what was displayed.
- **Past citation tokens are stripped from conversation history** before being replayed to the model, so it re-checks the document instead of copying stale page numbers.
- Fixed pre-existing lint failures (`B904`, import ordering) so `just check` runs clean.

## Two baseline bugs I found along the way

**The conversation delete button was unreachable.** Radix's `ScrollArea` sets `display: table` on the viewport's inner wrapper so content can size itself for horizontal scrolling. A table shrink-wraps to its content, so the sidebar list stretched to 368px to fit the longest conversation title while the viewport stayed 249px. Every row inherited that width, which meant `truncate` never had a constraint to work against *and* the right-aligned delete button sat ~75px outside the clipped area. The app's only destructive action was invisible and unclickable. One line on the viewport (`[&>div]:!block`) fixed both symptoms — the button is reachable and titles finally ellipsis instead of running under the border. This list only scrolls vertically, so nothing is lost by dropping the table sizing.

**Neither delete asked for confirmation**, and the two carry very different stakes. Deleting a conversation cascades to every message *and* every uploaded document in the deal — for a lawyer, that is the work product — while deleting a document loses one file. Both were single-click, no undo, on a hover-revealed icon sitting inside the row you click to select. I matched the remedy to the risk rather than treating them alike: conversations get a modal that names what will be lost ("its full question history, and 3 uploaded documents"), because the cascade is invisible otherwise; documents get an inline click-again confirm, which is lighter than a modal for a smaller loss and auto-reverts so no row is left armed.

## Known limitations

- Highlighting works at PDF text-item granularity, so a match can spill a few words past the quote at the boundary. Erring toward slightly-too-much beats missing the passage.
- Verification is a normalised substring check — it confirms the quote exists on the cited page, not that it supports the claim. It catches fabrication, not misreading.
- Citations are checked against extracted text, so a scanned page yields no verifiable citations at all.
- Every document goes into every prompt. Fine for a handful; it will not survive a real data room. See the trade-off above.
- Deleting a document leaves citations in past answers pointing at it. Those pills stay correctly attributed — citations store the document id, not its position in the prompt — and clicking one says the document was removed rather than drawing the quote over an unrelated file. But the old answer still reads as though the document were there.
- A citation records the filename as it was when cited. Since identity is content, re-uploading the same bytes under a *different* name still re-links, so a pill can show the old name while the reader opens the renamed file. That is the intended reading — the pill records what the answer actually cited.
- Deletes now confirm, but there is still no undo — a confirmed delete is final.
