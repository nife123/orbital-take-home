import {
	ChevronDown,
	ChevronLeft,
	ChevronRight,
	FileText,
	Loader2,
	Trash2,
	X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Document as PDFDocument, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { getDocumentUrl } from "../lib/api";
import { normalizeForMatch, resolveCitationDocument } from "../lib/citations";
import type { Citation, Document } from "../types";
import { Button } from "./ui/button";

/**
 * Work out which text-layer items make up a quote.
 *
 * The PDF text layer splits a sentence across many items, so a quote almost
 * never survives intact inside one of them. Testing items independently is not
 * an option either: a common word like "including" would match wherever it
 * appears on the page, which in a lease means highlighting the landlord's
 * covenant when the citation was about the tenant's.
 *
 * So the page is reassembled into a single normalised string, the quote is
 * located once within it, and only the items overlapping that span are
 * highlighted — the passage, and nothing that merely resembles it.
 */
function findQuoteItems(items: string[], normalizedQuote: string): Set<number> {
	const spans: { start: number; end: number; index: number }[] = [];
	let combined = "";

	items.forEach((str, index) => {
		const normalized = normalizeForMatch(str);
		if (!normalized) return;
		const start = combined ? combined.length + 1 : 0;
		combined = combined ? `${combined} ${normalized}` : normalized;
		spans.push({ start, end: combined.length, index });
	});

	const matchStart = combined.indexOf(normalizedQuote);
	if (matchStart === -1) return new Set();
	const matchEnd = matchStart + normalizedQuote.length;

	return new Set(
		spans
			.filter((span) => span.start < matchEnd && span.end > matchStart)
			.map((span) => span.index),
	);
}

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
	"pdfjs-dist/build/pdf.worker.min.mjs",
	import.meta.url,
).toString();

const MIN_WIDTH = 280;
const MAX_WIDTH = 700;
const DEFAULT_WIDTH = 400;

interface DocumentViewerProps {
	documents: Document[];
	activeDocumentId: string | null;
	activeCitation?: Citation | null;
	onSelectDocument: (documentId: string) => void;
	onDeleteDocument?: (documentId: string) => void;
	onClearCitation?: () => void;
}

export function DocumentViewer({
	documents,
	activeDocumentId,
	activeCitation,
	onSelectDocument,
	onDeleteDocument,
	onClearCitation,
}: DocumentViewerProps) {
	const [numPages, setNumPages] = useState<number>(0);
	const [currentPage, setCurrentPage] = useState(1);
	const [pdfLoading, setPdfLoading] = useState(true);
	const [pdfError, setPdfError] = useState<string | null>(null);
	const [width, setWidth] = useState(DEFAULT_WIDTH);
	const [dragging, setDragging] = useState(false);
	const [pickerOpen, setPickerOpen] = useState(false);
	const [hoveredId, setHoveredId] = useState<string | null>(null);
	// Removing one document is a smaller loss than deleting a whole deal, so it
	// asks with a second click rather than a modal — but it still asks.
	const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(
		null,
	);

	// Don't leave a row armed indefinitely; a stale red button is a trap. Long
	// enough to read and decide, and it fails safe either way — a late click
	// re-arms rather than deletes.
	useEffect(() => {
		if (!confirmingDeleteId) return;
		const timer = setTimeout(() => setConfirmingDeleteId(null), 5000);
		return () => clearTimeout(timer);
	}, [confirmingDeleteId]);
	const containerRef = useRef<HTMLDivElement>(null);
	const scrollRef = useRef<HTMLDivElement>(null);

	// A citation can outlive the document it points at, since past answers keep
	// their citations after a document is removed. Falling back to documents[0]
	// would draw the citation banner over an unrelated file — exactly the
	// mislead this feature exists to prevent — so say the document is gone.
	//
	// Resolution is by id then content hash, so a document that was deleted and
	// re-uploaded is found again rather than being reported as missing.
	const citedDocument = resolveCitationDocument(activeCitation, documents);
	const citedDocumentMissing = !!activeCitation && !citedDocument;

	// While a citation is active the reader shows the document that citation
	// resolves to, derived here from current props rather than relying on the
	// selection the click handler pushed up to App. Those two must never
	// disagree: showing one document while the banner describes another is the
	// precise failure this feature exists to prevent.
	const document =
		citedDocument ??
		documents.find((doc) => doc.id === activeDocumentId) ??
		documents[0] ??
		null;

	// Follow the cited page when a citation is clicked, while leaving the manual
	// page controls free to move away from it afterwards. If the cited document
	// is gone, stay put: its page number means nothing in whatever file is on
	// screen instead.
	useEffect(() => {
		if (activeCitation && !citedDocumentMissing) {
			setCurrentPage(activeCitation.page);
			scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
		}
	}, [activeCitation, citedDocumentMissing]);

	// Text of the page currently rendered, in text-layer order. Cleared whenever
	// the page *or* the document changes, so one document's text can never be
	// matched against another's page.
	const [pageText, setPageText] = useState<string[]>([]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: currentPage and document id are reset triggers, not values read here
	useEffect(() => {
		setPageText([]);
	}, [currentPage, document?.id]);

	const normalizedQuote = useMemo(
		() => (activeCitation ? normalizeForMatch(activeCitation.quote) : null),
		[activeCitation],
	);

	const highlightedItems = useMemo(() => {
		// Only highlight when we are looking at exactly what was cited. Page
		// numbers collide across documents, so the document has to match too —
		// otherwise paging through a different file lights up unrelated text.
		const citationIsHere =
			activeCitation &&
			currentPage === activeCitation.page &&
			(!activeCitation.document_id || citedDocument?.id === document?.id);

		if (!normalizedQuote || !citationIsHere) return new Set<number>();
		return findQuoteItems(pageText, normalizedQuote);
	}, [
		normalizedQuote,
		pageText,
		currentPage,
		activeCitation,
		citedDocument,
		document,
	]);

	const customTextRenderer = useCallback(
		({ itemIndex, str }: { itemIndex: number; str: string }) =>
			highlightedItems.has(itemIndex)
				? `<mark class="citation-highlight">${str}</mark>`
				: str,
		[highlightedItems],
	);

	const handleMouseDown = useCallback(
		(e: React.MouseEvent) => {
			e.preventDefault();
			setDragging(true);

			const startX = e.clientX;
			const startWidth = width;

			const handleMouseMove = (moveEvent: MouseEvent) => {
				const delta = startX - moveEvent.clientX;
				const newWidth = Math.min(
					MAX_WIDTH,
					Math.max(MIN_WIDTH, startWidth + delta),
				);
				setWidth(newWidth);
			};

			const handleMouseUp = () => {
				setDragging(false);
				window.removeEventListener("mousemove", handleMouseMove);
				window.removeEventListener("mouseup", handleMouseUp);
			};

			window.addEventListener("mousemove", handleMouseMove);
			window.addEventListener("mouseup", handleMouseUp);
		},
		[width],
	);

	const pdfPageWidth = width - 48; // account for px-4 padding on each side

	if (!document) {
		return (
			<div
				style={{ width }}
				className="flex h-full flex-shrink-0 flex-col items-center justify-center border-l border-neutral-200 bg-neutral-50"
			>
				<FileText className="mb-3 h-10 w-10 text-neutral-300" />
				<p className="text-neutral-400 text-sm">No documents uploaded</p>
			</div>
		);
	}

	const pdfUrl = getDocumentUrl(document.id);

	return (
		<div
			ref={containerRef}
			style={{ width }}
			className="relative flex h-full flex-shrink-0 flex-col border-l border-neutral-200 bg-white"
		>
			{/* Resize handle */}
			<div
				className={`absolute top-0 left-0 z-10 h-full w-1.5 cursor-col-resize transition-colors hover:bg-neutral-300 ${
					dragging ? "bg-neutral-400" : ""
				}`}
				onMouseDown={handleMouseDown}
			/>

			{/*
			 * Header — expands into the document list. Available even with a single
			 * document, because that list is where a document is removed, and the
			 * wrong file is most likely to be the first one uploaded.
			 */}
			<div className="border-neutral-100 border-b">
				<button
					type="button"
					onClick={() => {
						setPickerOpen((open) => !open);
						setConfirmingDeleteId(null);
					}}
					className="flex w-full items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-neutral-50"
				>
					<div className="min-w-0 flex-1">
						<p className="truncate font-medium text-neutral-800 text-sm">
							{document.filename}
						</p>
						<p className="text-neutral-400 text-xs">
							{document.page_count} page{document.page_count !== 1 ? "s" : ""}
							{documents.length > 1 && ` · ${documents.length} documents`}
						</p>
					</div>
					{documents.length > 0 && (
						<ChevronDown
							className={`h-4 w-4 flex-shrink-0 text-neutral-400 transition-transform ${
								pickerOpen ? "rotate-180" : ""
							}`}
						/>
					)}
				</button>

				{pickerOpen && documents.length > 0 && (
					<div className="max-h-56 overflow-y-auto border-neutral-100 border-t bg-neutral-50 py-1">
						{documents.map((doc) => (
							<button
								key={doc.id}
								type="button"
								onClick={() => {
									onSelectDocument(doc.id);
									setCurrentPage(1);
									setPickerOpen(false);
								}}
								onMouseEnter={() => setHoveredId(doc.id)}
								onMouseLeave={() => setHoveredId(null)}
								className={`group flex w-full items-center gap-2 px-4 py-2 text-left transition-colors hover:bg-neutral-100 ${
									doc.id === document.id ? "bg-neutral-100" : ""
								}`}
							>
								<FileText className="h-3.5 w-3.5 flex-shrink-0 text-neutral-400" />
								<span className="min-w-0 flex-1 truncate text-neutral-700 text-xs">
									{doc.filename}
								</span>
								{confirmingDeleteId === doc.id && onDeleteDocument ? (
									<button
										type="button"
										className="flex-shrink-0 rounded bg-red-50 px-1.5 py-0.5 font-medium text-[11px] text-red-600 transition-colors hover:bg-red-100"
										onClick={(e) => {
											e.stopPropagation();
											onDeleteDocument(doc.id);
											setConfirmingDeleteId(null);
										}}
										title={`Confirm removing ${doc.filename}`}
									>
										Remove?
									</button>
								) : hoveredId === doc.id && onDeleteDocument ? (
									<button
										type="button"
										className="flex-shrink-0 rounded p-0.5 text-neutral-400 transition-colors hover:bg-neutral-200 hover:text-red-500"
										onClick={(e) => {
											e.stopPropagation();
											setConfirmingDeleteId(doc.id);
										}}
										title={`Remove ${doc.filename}`}
									>
										<Trash2 className="h-3 w-3" />
									</button>
								) : (
									<span className="flex-shrink-0 text-[11px] text-neutral-400">
										{doc.page_count}p
									</span>
								)}
							</button>
						))}
					</div>
				)}
			</div>

			{/* Active citation banner */}
			{activeCitation && (
				<div
					className={`flex items-start gap-2 border-b px-4 py-2.5 ${
						activeCitation.verified && !citedDocumentMissing
							? "border-neutral-100 bg-neutral-50"
							: "border-amber-100 bg-amber-50"
					}`}
				>
					<div className="min-w-0 flex-1">
						<p
							className={`font-medium text-[11px] uppercase tracking-wide ${
								activeCitation.verified && !citedDocumentMissing
									? "text-neutral-400"
									: "text-amber-600"
							}`}
						>
							{citedDocumentMissing
								? `${activeCitation.document_name ?? "That document"} has been removed`
								: activeCitation.verified
									? `Cited from page ${activeCitation.page}`
									: `Not found on page ${activeCitation.page}`}
						</p>
						<p className="mt-0.5 text-neutral-600 text-xs italic leading-relaxed">
							“{activeCitation.quote}”
						</p>
					</div>
					<button
						type="button"
						onClick={onClearCitation}
						className="flex-shrink-0 rounded p-0.5 text-neutral-400 transition-colors hover:bg-neutral-200 hover:text-neutral-600"
						aria-label="Clear citation"
					>
						<X className="h-3.5 w-3.5" />
					</button>
				</div>
			)}

			{/* PDF content */}
			<div ref={scrollRef} className="flex-1 overflow-y-auto p-4">
				{pdfError && (
					<div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
						{pdfError}
					</div>
				)}

				<PDFDocument
					file={pdfUrl}
					onLoadSuccess={({ numPages: pages }) => {
						setNumPages(pages);
						setPdfLoading(false);
						setPdfError(null);
					}}
					onLoadError={(error) => {
						setPdfError(`Failed to load PDF: ${error.message}`);
						setPdfLoading(false);
					}}
					loading={
						<div className="flex items-center justify-center py-12">
							<Loader2 className="h-6 w-6 animate-spin text-neutral-400" />
						</div>
					}
				>
					{!pdfLoading && !pdfError && (
						<Page
							pageNumber={currentPage}
							width={pdfPageWidth}
							customTextRenderer={customTextRenderer}
							onGetTextSuccess={({ items }) => {
								const next = items.map((item) =>
									"str" in item ? item.str : "",
								);
								// Keep the previous array when the content is unchanged:
								// highlighting re-renders the text layer, and a fresh array
								// identity each time would re-trigger this callback forever.
								setPageText((prev) =>
									prev.length === next.length &&
									prev.every((value, i) => value === next[i])
										? prev
										: next,
								);
							}}
							loading={
								<div className="flex items-center justify-center py-12">
									<Loader2 className="h-5 w-5 animate-spin text-neutral-300" />
								</div>
							}
						/>
					)}
				</PDFDocument>
			</div>

			{/* Page navigation */}
			{numPages > 0 && (
				<div className="flex items-center justify-center gap-3 border-t border-neutral-100 px-4 py-2.5">
					<Button
						variant="ghost"
						size="icon"
						className="h-7 w-7"
						disabled={currentPage <= 1}
						onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
					>
						<ChevronLeft className="h-4 w-4" />
					</Button>
					<span className="text-xs text-neutral-500">
						Page {currentPage} of {numPages}
					</span>
					<Button
						variant="ghost"
						size="icon"
						className="h-7 w-7"
						disabled={currentPage >= numPages}
						onClick={() => setCurrentPage((p) => Math.min(numPages, p + 1))}
					>
						<ChevronRight className="h-4 w-4" />
					</Button>
				</div>
			)}
		</div>
	);
}
