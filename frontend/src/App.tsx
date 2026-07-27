import { useCallback, useEffect, useState } from "react";
import { ChatSidebar } from "./components/ChatSidebar";
import { ChatWindow } from "./components/ChatWindow";
import { DocumentViewer } from "./components/DocumentViewer";
import { TooltipProvider } from "./components/ui/tooltip";
import { useConversations } from "./hooks/use-conversations";
import { useDocument } from "./hooks/use-document";
import { useMessages } from "./hooks/use-messages";
import type { Citation } from "./types";

export default function App() {
	// The citation the user is currently inspecting. Lives here because it is the
	// link between the answer (left) and the document (right).
	const [activeCitation, setActiveCitation] = useState<Citation | null>(null);
	const {
		conversations,
		selectedId,
		loading: conversationsLoading,
		create,
		select,
		remove,
		refresh: refreshConversations,
	} = useConversations();

	const {
		messages,
		loading: messagesLoading,
		error: messagesError,
		streaming,
		streamingContent,
		send,
	} = useMessages(selectedId);

	const {
		document,
		upload,
		refresh: refreshDocument,
	} = useDocument(selectedId);

	// A citation points into a specific document, so it can't survive a switch.
	// biome-ignore lint/correctness/useExhaustiveDependencies: selectedId is the reset trigger, not a value read here
	useEffect(() => {
		setActiveCitation(null);
	}, [selectedId]);

	const handleSend = useCallback(
		async (content: string) => {
			setActiveCitation(null);
			await send(content);
			refreshConversations();
		},
		[send, refreshConversations],
	);

	const handleClearCitation = useCallback(() => setActiveCitation(null), []);

	const handleUpload = useCallback(
		async (file: File) => {
			const doc = await upload(file);
			if (doc) {
				refreshDocument();
				refreshConversations();
			}
		},
		[upload, refreshDocument, refreshConversations],
	);

	const handleCreate = useCallback(async () => {
		await create();
	}, [create]);

	return (
		<TooltipProvider delayDuration={200}>
			<div className="flex h-screen bg-neutral-50">
				<ChatSidebar
					conversations={conversations}
					selectedId={selectedId}
					loading={conversationsLoading}
					onSelect={select}
					onCreate={handleCreate}
					onDelete={remove}
				/>

				<ChatWindow
					messages={messages}
					loading={messagesLoading}
					error={messagesError}
					streaming={streaming}
					streamingContent={streamingContent}
					hasDocument={!!document}
					conversationId={selectedId}
					onSend={handleSend}
					onUpload={handleUpload}
					activeCitation={activeCitation}
					onCitationSelect={setActiveCitation}
				/>

				<DocumentViewer
					document={document}
					activeCitation={activeCitation}
					onClearCitation={handleClearCitation}
				/>
			</div>
		</TooltipProvider>
	);
}
