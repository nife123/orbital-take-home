import { motion } from "framer-motion";
import { Bot } from "lucide-react";
import { useMemo } from "react";
import { Streamdown } from "streamdown";
import "streamdown/styles.css";
import { citationIndexFromHref, parseCitations } from "../lib/citations";
import type { Citation, Message } from "../types";
import { CitationPill } from "./CitationPill";

interface CitedAnswerProps {
	content: string;
	serverCitations?: Citation[];
	activeCitation: Citation | null;
	onCitationSelect: (citation: Citation) => void;
	streaming?: boolean;
}

/**
 * Renders an assistant answer, swapping inline citation tokens for clickable
 * pills. Citation tokens are rewritten to `#cite-N` links first, then the link
 * renderer maps them back to the parsed citation by index.
 */
function CitedAnswer({
	content,
	serverCitations,
	activeCitation,
	onCitationSelect,
	streaming,
}: CitedAnswerProps) {
	const { markdown, citations } = useMemo(
		() => parseCitations(content, serverCitations),
		[content, serverCitations],
	);

	const components = useMemo(
		() => ({
			a: ({
				href,
				children,
				...props
			}: React.AnchorHTMLAttributes<HTMLAnchorElement>) => {
				const index = citationIndexFromHref(href);
				const citation = index === null ? undefined : citations[index];

				if (!citation) {
					return (
						<a href={href} {...props}>
							{children}
						</a>
					);
				}

				return (
					<CitationPill
						citation={citation}
						active={
							activeCitation?.page === citation.page &&
							activeCitation?.quote === citation.quote
						}
						pending={!serverCitations}
						onSelect={onCitationSelect}
					/>
				);
			},
		}),
		[citations, activeCitation, onCitationSelect, serverCitations],
	);

	return (
		<div className="prose">
			<Streamdown
				components={components}
				mode={streaming ? "streaming" : "static"}
			>
				{markdown}
			</Streamdown>
		</div>
	);
}

interface MessageBubbleProps {
	message: Message;
	activeCitation: Citation | null;
	onCitationSelect: (citation: Citation) => void;
}

export function MessageBubble({
	message,
	activeCitation,
	onCitationSelect,
}: MessageBubbleProps) {
	if (message.role === "system") {
		return (
			<motion.div
				initial={{ opacity: 0 }}
				animate={{ opacity: 1 }}
				transition={{ duration: 0.2 }}
				className="flex justify-center py-2"
			>
				<p className="text-xs text-neutral-400">{message.content}</p>
			</motion.div>
		);
	}

	if (message.role === "user") {
		return (
			<motion.div
				initial={{ opacity: 0, y: 8 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ duration: 0.2 }}
				className="flex justify-end py-1.5"
			>
				<div className="max-w-[75%] rounded-2xl rounded-br-md bg-neutral-100 px-4 py-2.5">
					<p className="whitespace-pre-wrap text-sm text-neutral-800">
						{message.content}
					</p>
				</div>
			</motion.div>
		);
	}

	// Assistant message
	return (
		<motion.div
			initial={{ opacity: 0, y: 8 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.2 }}
			className="flex gap-3 py-1.5"
		>
			<div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-neutral-900">
				<Bot className="h-4 w-4 text-white" />
			</div>
			<div className="min-w-0 max-w-[80%]">
				<CitedAnswer
					content={message.content}
					serverCitations={message.citations}
					activeCitation={activeCitation}
					onCitationSelect={onCitationSelect}
				/>
				{message.citations?.length === 0 && (
					<p className="mt-1.5 text-neutral-400 text-xs">
						No sources cited — not grounded in the document
					</p>
				)}
			</div>
		</motion.div>
	);
}

interface StreamingBubbleProps {
	content: string;
	activeCitation: Citation | null;
	onCitationSelect: (citation: Citation) => void;
}

export function StreamingBubble({
	content,
	activeCitation,
	onCitationSelect,
}: StreamingBubbleProps) {
	return (
		<div className="flex gap-3 py-1.5">
			<div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-neutral-900">
				<Bot className="h-4 w-4 text-white" />
			</div>
			<div className="min-w-0 max-w-[80%]">
				{content ? (
					<CitedAnswer
						content={content}
						activeCitation={activeCitation}
						onCitationSelect={onCitationSelect}
						streaming
					/>
				) : (
					<div className="flex items-center gap-1 py-2">
						<span className="h-1.5 w-1.5 animate-pulse rounded-full bg-neutral-400" />
						<span
							className="h-1.5 w-1.5 animate-pulse rounded-full bg-neutral-400"
							style={{ animationDelay: "0.15s" }}
						/>
						<span
							className="h-1.5 w-1.5 animate-pulse rounded-full bg-neutral-400"
							style={{ animationDelay: "0.3s" }}
						/>
					</div>
				)}
				<span className="inline-block h-4 w-0.5 animate-pulse bg-neutral-400" />
			</div>
		</div>
	);
}
