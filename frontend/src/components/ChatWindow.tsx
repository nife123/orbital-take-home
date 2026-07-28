import { Loader2 } from "lucide-react";
import { useEffect, useRef } from "react";
import type { Citation, Message } from "../types";
import { ChatInput } from "./ChatInput";
import { EmptyState } from "./EmptyState";
import { MessageBubble, StreamingBubble } from "./MessageBubble";

interface ChatWindowProps {
	messages: Message[];
	loading: boolean;
	error: string | null;
	notice: string | null;
	streaming: boolean;
	streamingContent: string;
	documentCount: number;
	conversationId: string | null;
	onSend: (content: string) => void;
	onUpload: (files: File[]) => void;
	activeCitation: Citation | null;
	onCitationSelect: (citation: Citation) => void;
}

export function ChatWindow({
	messages,
	loading,
	error,
	notice,
	streaming,
	streamingContent,
	documentCount,
	conversationId,
	onSend,
	onUpload,
	activeCitation,
	onCitationSelect,
}: ChatWindowProps) {
	const scrollRef = useRef<HTMLDivElement>(null);

	// Auto-scroll to bottom when new messages arrive or during streaming
	const messagesLength = messages.length;
	// biome-ignore lint/correctness/useExhaustiveDependencies: messages and streamingContent are intentional triggers for auto-scroll
	useEffect(() => {
		if (scrollRef.current) {
			scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
		}
	}, [messagesLength, streamingContent]);

	// No conversation selected
	if (!conversationId) {
		return (
			<div className="flex flex-1 items-center justify-center bg-neutral-50">
				<div className="text-center">
					<p className="text-sm text-neutral-400">
						Select a conversation or create a new one
					</p>
				</div>
			</div>
		);
	}

	// Loading messages
	if (loading) {
		return (
			<div className="flex flex-1 items-center justify-center bg-white">
				<Loader2 className="h-6 w-6 animate-spin text-neutral-400" />
			</div>
		);
	}

	// Shown in both branches below: uploads happen most often on an empty
	// conversation, so the outcome has to be visible there too.
	//
	// A notice is deliberately not styled as an error. "Already in this
	// conversation" means the user's intent is satisfied and there is nothing to
	// fix, so it reports rather than alarms; red is reserved for uploads that
	// genuinely did not happen and need the user to act.
	const banners = (
		<>
			{error && (
				<div className="mx-4 mt-2 rounded-lg bg-red-50 px-4 py-2 text-red-600 text-sm">
					{error}
				</div>
			)}
			{notice && (
				<div className="mx-4 mt-2 rounded-lg bg-neutral-100 px-4 py-2 text-neutral-600 text-sm">
					{notice}
				</div>
			)}
		</>
	);

	// Empty conversation - show upload prompt
	if (messages.length === 0 && !streaming) {
		return (
			<div className="flex flex-1 flex-col bg-white">
				{banners}
				<div className="flex flex-1 items-center justify-center">
					{documentCount > 0 ? (
						<div className="text-center">
							<p className="text-neutral-500 text-sm">
								{documentCount === 1
									? "Document uploaded. Ask a question to get started."
									: `${documentCount} documents uploaded. Ask a question across all of them.`}
							</p>
						</div>
					) : (
						<EmptyState onUpload={onUpload} />
					)}
				</div>
				<ChatInput
					onSend={onSend}
					onUpload={onUpload}
					disabled={streaming}
					documentCount={documentCount}
				/>
			</div>
		);
	}

	return (
		<div className="flex flex-1 flex-col bg-white">
			{banners}

			<div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-4">
				<div className="mx-auto max-w-2xl space-y-1">
					{messages.map((message) => (
						<MessageBubble
							key={message.id}
							message={message}
							activeCitation={activeCitation}
							onCitationSelect={onCitationSelect}
						/>
					))}
					{streaming && (
						<StreamingBubble
							content={streamingContent}
							activeCitation={activeCitation}
							onCitationSelect={onCitationSelect}
						/>
					)}
				</div>
			</div>

			<ChatInput
				onSend={onSend}
				onUpload={onUpload}
				disabled={streaming}
				documentCount={documentCount}
			/>
		</div>
	);
}
