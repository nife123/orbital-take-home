import type { Citation } from "../types";

/**
 * The model emits citations inline as `[[cite:PAGE|verbatim quote]]`, so a claim
 * and its source stay next to each other in the prose. This module turns those
 * tokens into something the markdown renderer can display.
 */
const CITATION_RE = /\[\[cite:(\d+)\|([^\]]+?)\]\]/g;

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

	const markdown = source.replace(CITATION_RE, (_match, page, quote) => {
		const index = citations.length;
		citations.push({
			page: Number(page),
			quote: String(quote).trim(),
			verified: serverCitations?.[index]?.verified ?? false,
		});
		return `[p.${page}](#cite-${index})`;
	});

	return { markdown, citations };
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
