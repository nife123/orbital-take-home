import { AnimatePresence, motion } from "framer-motion";
import { MessageSquarePlus, Trash2 } from "lucide-react";
import { useState } from "react";
import { relativeTime } from "../lib/utils";
import type { Conversation } from "../types";
import { Button } from "./ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "./ui/dialog";
import { ScrollArea } from "./ui/scroll-area";

interface ChatSidebarProps {
	conversations: Conversation[];
	selectedId: string | null;
	loading: boolean;
	onSelect: (id: string) => void;
	onCreate: () => void;
	onDelete: (id: string) => void;
}

export function ChatSidebar({
	conversations,
	selectedId,
	loading,
	onSelect,
	onCreate,
	onDelete,
}: ChatSidebarProps) {
	const [hoveredId, setHoveredId] = useState<string | null>(null);
	// Deleting a conversation cascades to every document and message in it, so
	// it asks first — and names what will be lost rather than saying "are you sure".
	const [pendingDelete, setPendingDelete] = useState<Conversation | null>(null);

	return (
		<div className="flex h-full w-[250px] flex-shrink-0 flex-col border-r border-neutral-200 bg-white">
			<div className="flex items-center justify-between border-b border-neutral-100 p-3">
				<span className="text-sm font-semibold text-neutral-700">Chats</span>
				<Button variant="ghost" size="icon" onClick={onCreate} title="New chat">
					<MessageSquarePlus className="h-4 w-4" />
				</Button>
			</div>

			<ScrollArea className="flex-1">
				<div className="p-2">
					{loading && conversations.length === 0 && (
						<div className="space-y-2 p-2">
							{[1, 2, 3].map((i) => (
								<div key={i} className="animate-pulse space-y-1">
									<div className="h-4 w-3/4 rounded bg-neutral-100" />
									<div className="h-3 w-1/2 rounded bg-neutral-50" />
								</div>
							))}
						</div>
					)}

					{!loading && conversations.length === 0 && (
						<p className="px-2 py-8 text-center text-xs text-neutral-400">
							No conversations yet
						</p>
					)}

					<AnimatePresence initial={false}>
						{conversations.map((conversation) => (
							<motion.div
								key={conversation.id}
								initial={{ opacity: 0, height: 0 }}
								animate={{ opacity: 1, height: "auto" }}
								exit={{ opacity: 0, height: 0 }}
								transition={{ duration: 0.15 }}
							>
								<button
									type="button"
									className={`group flex w-full items-center rounded-lg px-3 py-2.5 text-left transition-colors ${
										selectedId === conversation.id
											? "bg-neutral-100"
											: "hover:bg-neutral-50"
									}`}
									onClick={() => onSelect(conversation.id)}
									onMouseEnter={() => setHoveredId(conversation.id)}
									onMouseLeave={() => setHoveredId(null)}
								>
									<div className="min-w-0 flex-1 overflow-hidden">
										<p className="truncate text-sm font-medium text-neutral-800">
											{conversation.title}
										</p>
										<p className="mt-0.5 text-neutral-400 text-xs">
											{relativeTime(conversation.updated_at)}
											{conversation.document_count > 0 &&
												` · ${conversation.document_count} doc${
													conversation.document_count === 1 ? "" : "s"
												}`}
										</p>
									</div>

									<div className="ml-2 w-6 flex-shrink-0">
										{hoveredId === conversation.id && (
											<button
												type="button"
												className="rounded p-1 text-neutral-400 hover:bg-neutral-200 hover:text-red-500"
												onClick={(e) => {
													e.stopPropagation();
													setPendingDelete(conversation);
												}}
												title="Delete conversation"
											>
												<Trash2 className="h-3.5 w-3.5" />
											</button>
										)}
									</div>
								</button>
							</motion.div>
						))}
					</AnimatePresence>
				</div>
			</ScrollArea>

			<Dialog
				open={pendingDelete !== null}
				onOpenChange={(open) => !open && setPendingDelete(null)}
			>
				<DialogContent className="max-w-md">
					<DialogHeader>
						<DialogTitle>Delete “{pendingDelete?.title}”?</DialogTitle>
						<DialogDescription>
							{pendingDelete && pendingDelete.document_count > 0
								? `This permanently removes the conversation, its full question history, and ${pendingDelete.document_count} uploaded document${
										pendingDelete.document_count === 1 ? "" : "s"
									}. This cannot be undone.`
								: "This permanently removes the conversation and its full question history. This cannot be undone."}
						</DialogDescription>
					</DialogHeader>
					<div className="flex justify-end gap-2">
						<Button variant="ghost" onClick={() => setPendingDelete(null)}>
							Cancel
						</Button>
						<Button
							className="bg-red-600 text-white hover:bg-red-700"
							onClick={() => {
								if (pendingDelete) onDelete(pendingDelete.id);
								setPendingDelete(null);
							}}
						>
							Delete
						</Button>
					</div>
				</DialogContent>
			</Dialog>
		</div>
	);
}
