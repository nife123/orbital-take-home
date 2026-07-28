import type {
	Conversation,
	ConversationDetail,
	Document,
	Message,
} from "../types";

const BASE = "/api";

/**
 * A failed request, carrying the status so callers can tell apart outcomes that
 * need different treatment — a duplicate upload (409) is not a failure the user
 * has to fix, whereas an oversized file (400) is.
 */
export class ApiError extends Error {
	readonly status: number;

	constructor(status: number, message: string) {
		super(message);
		this.name = "ApiError";
		this.status = status;
	}
}

/**
 * Pull a readable message out of a failed response.
 *
 * FastAPI puts the useful text in a `detail` field, and those messages are
 * written for the user ("… has already been added to this conversation"), so
 * they are worth surfacing verbatim rather than wrapping in status codes.
 */
async function errorMessage(response: Response): Promise<string> {
	const text = await response.text().catch(() => "");
	try {
		const parsed = JSON.parse(text) as { detail?: unknown };
		if (typeof parsed.detail === "string") return parsed.detail;
	} catch {
		// Not JSON — fall through to the raw body.
	}
	return text || `Request failed (${response.status})`;
}

async function handleResponse<T>(response: Response): Promise<T> {
	if (!response.ok) {
		throw new ApiError(response.status, await errorMessage(response));
	}
	return response.json() as Promise<T>;
}

export async function fetchConversations(): Promise<Conversation[]> {
	const res = await fetch(`${BASE}/conversations`);
	return handleResponse<Conversation[]>(res);
}

export async function createConversation(): Promise<Conversation> {
	const res = await fetch(`${BASE}/conversations`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ title: "New conversation" }),
	});
	return handleResponse<Conversation>(res);
}

export async function deleteConversation(id: string): Promise<void> {
	const res = await fetch(`${BASE}/conversations/${id}`, {
		method: "DELETE",
	});
	if (!res.ok) {
		throw new ApiError(res.status, await errorMessage(res));
	}
}

export async function renameConversation(
	id: string,
	title: string,
): Promise<void> {
	const res = await fetch(`${BASE}/conversations/${id}`, {
		method: "PATCH",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ title }),
	});
	if (!res.ok) {
		throw new ApiError(res.status, await errorMessage(res));
	}
}

export async function fetchConversation(
	id: string,
): Promise<ConversationDetail> {
	const res = await fetch(`${BASE}/conversations/${id}`);
	return handleResponse<ConversationDetail>(res);
}

export async function fetchMessages(
	conversationId: string,
): Promise<Message[]> {
	const res = await fetch(`${BASE}/conversations/${conversationId}/messages`);
	return handleResponse<Message[]>(res);
}

export async function sendMessage(
	conversationId: string,
	content: string,
): Promise<Response> {
	const res = await fetch(`${BASE}/conversations/${conversationId}/messages`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ content }),
	});
	if (!res.ok) {
		throw new ApiError(res.status, await errorMessage(res));
	}
	return res;
}

export async function uploadDocument(
	conversationId: string,
	file: File,
): Promise<Document> {
	const formData = new FormData();
	formData.append("file", file);
	const res = await fetch(`${BASE}/conversations/${conversationId}/documents`, {
		method: "POST",
		body: formData,
	});
	return handleResponse<Document>(res);
}

export async function deleteDocument(documentId: string): Promise<void> {
	const res = await fetch(`${BASE}/documents/${documentId}`, {
		method: "DELETE",
	});
	if (!res.ok) {
		throw new ApiError(res.status, await errorMessage(res));
	}
}

export function getDocumentUrl(documentId: string): string {
	return `${BASE}/documents/${documentId}/content`;
}
