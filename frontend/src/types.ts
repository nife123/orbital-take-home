export interface Conversation {
	id: string;
	title: string;
	created_at: string;
	updated_at: string;
	document_count: number;
}

/**
 * A document- and page-anchored reference emitted by the model. `verified` means
 * the backend found the quote in the extracted text of the page it cites, in the
 * document it named.
 *
 * The document fields are optional: citations saved before conversations could
 * hold more than one document don't carry them.
 */
export interface Citation {
	page: number;
	quote: string;
	verified: boolean;
	document_id?: string | null;
	document_name?: string | null;
	/**
	 * Content digest of the cited document. A row id dies when a document is
	 * deleted, but re-uploading the same file produces the same bytes — so this
	 * is what lets a citation find its source again.
	 */
	document_hash?: string | null;
}

export interface Message {
	id: string;
	conversation_id: string;
	role: "user" | "assistant" | "system";
	content: string;
	sources_cited: number;
	citations?: Citation[];
	created_at: string;
}

export interface Document {
	id: string;
	conversation_id: string;
	filename: string;
	page_count: number;
	uploaded_at: string;
	content_hash?: string | null;
}

export interface ConversationDetail extends Conversation {
	documents: Document[];
}
