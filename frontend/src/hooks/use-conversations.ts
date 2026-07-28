import { useCallback, useEffect, useState } from "react";
import * as api from "../lib/api";
import type { Conversation } from "../types";

export function useConversations() {
	const [conversations, setConversations] = useState<Conversation[]>([]);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const refresh = useCallback(async () => {
		try {
			setError(null);
			const data = await api.fetchConversations();
			setConversations(data);
		} catch (err) {
			setError(
				err instanceof Error ? err.message : "Failed to load conversations",
			);
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		refresh();
	}, [refresh]);

	const create = useCallback(async () => {
		try {
			setError(null);
			const conversation = await api.createConversation();
			setConversations((prev) => [conversation, ...prev]);
			setSelectedId(conversation.id);
			return conversation;
		} catch (err) {
			setError(
				err instanceof Error ? err.message : "Failed to create conversation",
			);
			return null;
		}
	}, []);

	const select = useCallback((id: string | null) => {
		setSelectedId(id);
	}, []);

	const remove = useCallback(
		async (id: string) => {
			try {
				setError(null);
				await api.deleteConversation(id);
				setConversations((prev) => prev.filter((c) => c.id !== id));
				if (selectedId === id) {
					setSelectedId(null);
				}
			} catch (err) {
				setError(
					err instanceof Error ? err.message : "Failed to delete conversation",
				);
			}
		},
		[selectedId],
	);

	const rename = useCallback(async (id: string, title: string) => {
		const trimmed = title.trim();
		if (!trimmed) return false;

		try {
			setError(null);
			await api.renameConversation(id, trimmed);
			// Patch the title only. The endpoint returns a ConversationDetail
			// (carrying `documents`) while this list holds Conversation objects
			// (carrying `document_count`), so replacing the item wholesale would
			// drop the document count from the row.
			setConversations((prev) =>
				prev.map((c) => (c.id === id ? { ...c, title: trimmed } : c)),
			);
			return true;
		} catch (err) {
			setError(
				err instanceof Error ? err.message : "Failed to rename conversation",
			);
			return false;
		}
	}, []);

	const selected = conversations.find((c) => c.id === selectedId) ?? null;

	return {
		conversations,
		selected,
		selectedId,
		loading,
		error,
		create,
		select,
		remove,
		rename,
		refresh,
	};
}
