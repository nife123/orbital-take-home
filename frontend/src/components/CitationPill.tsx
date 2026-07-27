import { AlertTriangle } from "lucide-react";
import type { Citation } from "../types";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

interface CitationPillProps {
	citation: Citation;
	active: boolean;
	/** True while the answer is still streaming and the backend has not checked yet. */
	pending?: boolean;
	onSelect: (citation: Citation) => void;
}

/**
 * An inline, clickable reference to a page of the source document.
 *
 * Verified pills are quiet and neutral — the normal case should not shout.
 * Unverified ones are amber, because a quote the backend could not find on the
 * cited page is exactly what a lawyer needs to be warned about.
 *
 * Mid-stream the answer has not been checked yet, which is not the same thing as
 * having failed the check. Pending pills stay neutral so a response doesn't flash
 * a screen full of false warnings while it types itself out.
 */
export function CitationPill({
	citation,
	active,
	pending,
	onSelect,
}: CitationPillProps) {
	const { page, quote, verified } = citation;
	const flagged = !pending && !verified;

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<button
					type="button"
					onClick={() => onSelect(citation)}
					className={`ml-0.5 inline-flex translate-y-[-1px] items-center gap-1 rounded-full border px-1.5 py-0.5 align-middle font-medium text-[11px] leading-none transition-colors ${
						flagged
							? active
								? "border-amber-500 bg-amber-500 text-white"
								: "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
							: active
								? "border-neutral-900 bg-neutral-900 text-white"
								: "border-neutral-200 bg-neutral-100 text-neutral-600 hover:border-neutral-300 hover:bg-neutral-200 hover:text-neutral-900"
					}`}
				>
					{flagged && <AlertTriangle className="h-2.5 w-2.5" />}
					p.{page}
				</button>
			</TooltipTrigger>
			<TooltipContent side="top" className="max-w-sm">
				<p className="text-xs leading-relaxed">
					{pending ? (
						<span className="text-neutral-400">Checking page {page}…</span>
					) : flagged ? (
						<span className="text-amber-300">
							Not found on page {page} — check this one
						</span>
					) : (
						<span className="text-neutral-300">Found on page {page}</span>
					)}
				</p>
				<p className="mt-1 border-neutral-700 border-l-2 pl-2 text-xs italic leading-relaxed">
					{quote}
				</p>
			</TooltipContent>
		</Tooltip>
	);
}
