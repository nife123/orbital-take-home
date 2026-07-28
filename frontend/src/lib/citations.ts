import type { Citation, Document } from "../types";

/**
 * Find the document a citation points at.
 *
 * Row id first — the normal case. Content hash as a fallback, because deleting
 * a document and uploading the same file again produces a new id for identical
 * bytes; without this the citation would keep reporting its source as removed
 * while that source sits in the list. A *different* file reused under the same
 * name correctly stays unresolved, which matching on filename would get wrong.
 */
export function resolveCitationDocument(
	citation: Citation | null | undefined,
	documents: Document[],
): Document | null {
	if (!citation) return null;

	const byId = citation.document_id
		? documents.find((doc) => doc.id === citation.document_id)
		: undefined;
	if (byId) return byId;

	const byHash = citation.document_hash
		? documents.find((doc) => doc.content_hash === citation.document_hash)
		: undefined;
	return byHash ?? null;
}

/**
 * The model emits citations inline as `[[cite:DOC|PAGE|verbatim quote]]`, so a
 * claim and its source stay next to each other in the prose. This module turns
 * those tokens into something the markdown renderer can display.
 */
const CITATION_RE = /\[\[cite:(\d+)\|(\d+)\|([^\]]+?)\]\]/g;

/**
 * The single-document format used before conversations could hold several
 * documents. Still parsed so pills in already-saved conversations keep
 * rendering rather than reverting to raw text.
 */
const LEGACY_CITATION_RE = /\[\[cite:(\d+)\|([^\]|]+?)\]\]/g;

/** A `[[` that has arrived but whose closing `]]` has not yet streamed in. */
const INCOMPLETE_TAIL_RE = /\[\[(?:c(?:i(?:t(?:e(?::[^\]]*)?)?)?)?)?$/;

export interface ParsedContent {
	/** Markdown with each citation token replaced by a `#cite-N` link. */
	markdown: string;
	/** Citations in the order they appear, index-aligned with the link hrefs. */
	citations: Citation[];
}

/**
 * Rewrite citation tokens into markdown links the renderer can map to pills.
 *
 * The href carries only the array index — never the quote — so the link survives
 * Streamdown's URL sanitisation and there is nothing to escape.
 *
 * @param content Raw message content, possibly mid-stream.
 * @param serverCitations Verified citations from the API. While a response is
 *   still streaming these do not exist yet, so citations render as unverified
 *   until the server has actually checked them.
 */
export function parseCitations(
	content: string,
	serverCitations?: Citation[],
): ParsedContent {
	const citations: Citation[] = [];

	// Drop a half-arrived token so it never flashes as raw text mid-stream.
	const source = content.replace(INCOMPLETE_TAIL_RE, "");

	const push = (page: string, quote: string) => {
		const index = citations.length;
		const fromServer = serverCitations?.[index];
		citations.push({
			page: Number(page),
			quote: quote.trim(),
			verified: fromServer?.verified ?? false,
			// The document is resolved server-side from the index the model used,
			// so mid-stream a pill knows its page but not yet its document.
			document_id: fromServer?.document_id ?? null,
			document_name: fromServer?.document_name ?? null,
			document_hash: fromServer?.document_hash ?? null,
		});
		return `[p.${page}](#cite-${index})`;
	};

	const markdown = source
		.replace(CITATION_RE, (_m, _doc, page, quote) => push(page, quote))
		.replace(LEGACY_CITATION_RE, (_m, page, quote) => push(page, quote));

	return { markdown, citations };
}

/**
 * A filename is far too long to sit inline in a sentence, so derive a short
 * label from it: "commercial-lease-100-bishopsgate.pdf" reads as
 * "Commercial Lease". The full name stays in the pill's tooltip.
 */
export function shortDocumentLabel(
	filename: string | null | undefined,
): string {
	if (!filename) return "";
	const words = filename
		.replace(/\.[^.]+$/, "")
		.split(/[-_\s]+/)
		.filter((word) => word && !/^\d+$/.test(word));

	return words
		.slice(0, 2)
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(" ");
}

/** Extract the citation index from a `#cite-N` href, or null if it isn't one. */
export function citationIndexFromHref(href: string | undefined): number | null {
	const match = /^#cite-(\d+)$/.exec(href ?? "");
	return match ? Number(match[1]) : null;
}

/**
 * Characters that differ between PDF extraction and model output far more often
 * than the words do. Flattened on both sides before matching.
 */
export function normalizeForMatch(text: string): string {
	return text
		.replace(/[‘’]/g, "'")
		.replace(/[“”]/g, '"')
		.replace(/[–—−]/g, "-")
		.replace(/\s+/g, " ")
		.trim()
		.toLowerCase();
}
