import { useCallback, useEffect, useState } from "react";
import * as api from "../lib/api";
import type { Document } from "../types";

export function useDocuments(conversationId: string | null) {
	const [documents, setDocuments] = useState<Document[]>([]);
	const [uploading, setUploading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	// Kept apart from `error`: a document that was already attached is not a
	// failure the user has to fix — their intent (have this in the deal) holds.
	// It still needs saying, or the upload just appears to do nothing.
	const [notice, setNotice] = useState<string | null>(null);

	const refresh = useCallback(async () => {
		if (!conversationId) {
			setDocuments([]);
			return;
		}
		try {
			setError(null);
			const detail = await api.fetchConversation(conversationId);
			setDocuments(detail.documents ?? []);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to load documents");
		}
	}, [conversationId]);

	useEffect(() => {
		refresh();
	}, [refresh]);

	/**
	 * Upload one or more PDFs. The endpoint takes a single file, so these go up
	 * sequentially — that also keeps upload order stable, which is the order
	 * documents are numbered for the model.
	 *
	 * A failure part-way through keeps the documents that already succeeded
	 * rather than discarding them; the error names the file that failed.
	 */
	const upload = useCallback(
		async (files: File[]) => {
			if (!conversationId || files.length === 0) return [];
			setUploading(true);
			setError(null);
			setNotice(null);

			const uploaded: Document[] = [];
			const alreadyPresent: string[] = [];
			try {
				for (const file of files) {
					try {
						uploaded.push(await api.uploadDocument(conversationId, file));
					} catch (err) {
						if (err instanceof api.ApiError && err.status === 409) {
							alreadyPresent.push(file.name);
							continue;
						}
						// Server-side messages already name the file, so they are shown
						// as-is; only a transport failure needs the filename adding.
						setError(
							err instanceof Error
								? err.message
								: `Couldn't upload ${file.name}.`,
						);
					}
				}

				if (alreadyPresent.length > 0) {
					setNotice(
						alreadyPresent.length === 1
							? `${alreadyPresent[0]} is already in this conversation.`
							: `${alreadyPresent.length} of these documents were already in this conversation.`,
					);
				}
				if (uploaded.length > 0) {
					setDocuments((prev) => [...prev, ...uploaded]);
				}
				return uploaded;
			} finally {
				setUploading(false);
			}
		},
		[conversationId],
	);

	const remove = useCallback(async (documentId: string) => {
		try {
			setError(null);
			await api.deleteDocument(documentId);
			setDocuments((prev) => prev.filter((doc) => doc.id !== documentId));
			return true;
		} catch (err) {
			setError(
				err instanceof Error ? err.message : "Failed to delete document",
			);
			return false;
		}
	}, []);

	return {
		documents,
		uploading,
		error,
		notice,
		upload,
		remove,
		refresh,
	};
}
