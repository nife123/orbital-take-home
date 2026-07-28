import { useCallback, useEffect, useRef, useState } from "react";
import { ChatSidebar } from "./components/ChatSidebar";
import { ChatWindow } from "./components/ChatWindow";
import { DocumentViewer } from "./components/DocumentViewer";
import { TooltipProvider } from "./components/ui/tooltip";
import { useConversations } from "./hooks/use-conversations";
import { useDocuments } from "./hooks/use-documents";
import { useMessages } from "./hooks/use-messages";
import { resolveCitationDocument } from "./lib/citations";
import type { Citation } from "./types";

export default function App() {
	// The citation the user is currently inspecting. Lives here because it is the
	// link between the answer (left) and the documents (right).
	const [activeCitation, setActiveCitation] = useState<Citation | null>(null);
	const [activeDocumentId, setActiveDocumentId] = useState<string | null>(null);
	const {
		conversations,
		selectedId,
		loading: conversationsLoading,
		create,
		select,
		remove,
		rename,
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
		documents,
		upload,
		remove: removeDocument,
		error: documentsError,
		notice: documentsNotice,
		refresh: refreshDocuments,
	} = useDocuments(selectedId);

	// A citation points into a specific document, so it can't survive a switch.
	// biome-ignore lint/correctness/useExhaustiveDependencies: selectedId is the reset trigger, not a value read here
	useEffect(() => {
		setActiveCitation(null);
		setActiveDocumentId(null);
	}, [selectedId]);

	const handleSend = useCallback(
		async (content: string) => {
			setActiveCitation(null);
			await send(content);
			refreshConversations();
		},
		[send, refreshConversations],
	);

	// Citation pills render inside Streamdown, which memoises settled blocks so
	// streaming doesn't re-render finished text. A pill therefore keeps whatever
	// onSelect it was first given, and a callback closing over `documents` would
	// go stale the moment a document is added or removed. Reading through a ref
	// keeps this handler's identity stable *and* its data current.
	const documentsRef = useRef(documents);
	documentsRef.current = documents;

	// Following a citation moves the reader to the document it came from. Resolve
	// rather than trusting the stored id: if that document was deleted and the
	// same file re-uploaded, the live row has a different id.
	const handleCitationSelect = useCallback((citation: Citation) => {
		setActiveCitation(citation);
		const target = resolveCitationDocument(citation, documentsRef.current);
		if (target) {
			setActiveDocumentId(target.id);
		}
	}, []);

	// Choosing a document by hand drops the citation — its highlight belongs to
	// wherever the user just navigated away from.
	const handleSelectDocument = useCallback((documentId: string) => {
		setActiveDocumentId(documentId);
		setActiveCitation(null);
	}, []);

	const handleClearCitation = useCallback(() => setActiveCitation(null), []);

	const handleUpload = useCallback(
		async (files: File[]) => {
			const uploaded = await upload(files);
			if (uploaded.length > 0) {
				refreshDocuments();
				refreshConversations();
			}
		},
		[upload, refreshDocuments, refreshConversations],
	);

	const handleDeleteDocument = useCallback(
		async (documentId: string) => {
			const deleted = await removeDocument(documentId);
			if (!deleted) return;

			// Drop any selection pointing at the document that just went away.
			setActiveDocumentId((current) =>
				current === documentId ? null : current,
			);
			setActiveCitation((current) =>
				current?.document_id === documentId ? null : current,
			);
			refreshConversations();
		},
		[removeDocument, refreshConversations],
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
					onRename={rename}
				/>

				<ChatWindow
					messages={messages}
					loading={messagesLoading}
					error={messagesError ?? documentsError}
					notice={documentsNotice}
					streaming={streaming}
					streamingContent={streamingContent}
					documentCount={documents.length}
					conversationId={selectedId}
					onSend={handleSend}
					onUpload={handleUpload}
					activeCitation={activeCitation}
					onCitationSelect={handleCitationSelect}
				/>

				<DocumentViewer
					documents={documents}
					activeDocumentId={activeDocumentId}
					activeCitation={activeCitation}
					onSelectDocument={handleSelectDocument}
					onDeleteDocument={handleDeleteDocument}
					onClearCitation={handleClearCitation}
				/>
			</div>
		</TooltipProvider>
	);
}
