from __future__ import annotations

import hashlib
import os
import re
import uuid

import fitz  # PyMuPDF
import structlog
from fastapi import UploadFile
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from takehome.config import settings
from takehome.db.models import Document

logger = structlog.get_logger()


class DuplicateDocumentError(ValueError):
    """Raised when the same file is already attached to the conversation.

    A distinct type so the router can map it to 409 without inspecting the
    message text.
    """

# Matches the page markers written by upload_document() below.
PAGE_MARKER_RE = re.compile(r"^--- Page (\d+) ---$", re.MULTILINE)


def split_pages(extracted_text: str | None) -> dict[int, str]:
    """Recover per-page text from a document's extracted text.

    Extraction stores every page behind a `--- Page N ---` marker, so the page
    boundaries survive in the stored blob and can be recovered without a schema
    change. Returns a mapping of 1-based page number to that page's text.
    """
    if not extracted_text:
        return {}

    # Splitting on a capturing group yields [preamble, page_no, body, page_no, body, ...]
    parts = PAGE_MARKER_RE.split(extracted_text)
    pages: dict[int, str] = {}
    for page_no, body in zip(parts[1::2], parts[2::2], strict=False):
        pages[int(page_no)] = body.strip()
    return pages


async def upload_document(
    session: AsyncSession, conversation_id: str, file: UploadFile
) -> Document:
    """Upload and process a PDF document for a conversation.

    Validates the file is a PDF, saves it to disk, extracts text using PyMuPDF,
    and stores metadata in the database. A conversation covers one deal, which
    carries many documents, so there is no limit on how many are attached — but
    the same bytes twice adds context cost and no information, so it is rejected.

    Raises ValueError if the file is not a PDF or is too large, and
    DuplicateDocumentError if identical content is already attached.
    """
    # Validate file type
    if file.content_type not in ("application/pdf", "application/x-pdf"):
        filename = file.filename or ""
        if not filename.lower().endswith(".pdf"):
            raise ValueError("Only PDF files are supported.")

    # Read file content
    content = await file.read()

    # Validate file size
    if len(content) > settings.max_upload_size:
        raise ValueError(
            f"File too large. Maximum size is {settings.max_upload_size // (1024 * 1024)}MB."
        )

    original_filename = file.filename or "document.pdf"

    # Reject redundant content before anything touches the disk, so a rejected
    # upload can't leave an orphan file behind. Matching on bytes rather than
    # filename is deliberate: a data room routinely holds a different Lease.pdf
    # in every tenant folder, and those must all be uploadable.
    content_hash = hashlib.sha256(content).hexdigest()
    existing = await session.execute(
        select(Document).where(
            Document.conversation_id == conversation_id,
            Document.content_hash == content_hash,
        )
    )
    if existing.scalars().first() is not None:
        raise DuplicateDocumentError(
            f"{original_filename} has already been added to this conversation."
        )

    # Generate a unique filename to avoid collisions
    unique_name = f"{uuid.uuid4().hex}_{original_filename}"
    file_path = os.path.join(settings.upload_dir, unique_name)

    # Ensure upload directory exists
    os.makedirs(settings.upload_dir, exist_ok=True)

    # Save the file to disk
    with open(file_path, "wb") as f:
        f.write(content)

    logger.info("Saved uploaded PDF", filename=original_filename, path=file_path, size=len(content))

    # Extract text using PyMuPDF
    extracted_text = ""
    page_count = 0
    try:
        doc = fitz.open(file_path)
        page_count = len(doc)
        pages: list[str] = []
        for page_num in range(page_count):
            page = doc[page_num]
            text = page.get_text()  # type: ignore[union-attr]
            if text.strip():
                pages.append(f"--- Page {page_num + 1} ---\n{text}")
        extracted_text = "\n\n".join(pages)
        doc.close()
    except Exception:
        logger.exception("Failed to extract text from PDF", filename=original_filename)
        extracted_text = ""

    logger.info(
        "Extracted text from PDF",
        filename=original_filename,
        page_count=page_count,
        text_length=len(extracted_text),
    )

    # Create the document record
    document = Document(
        conversation_id=conversation_id,
        filename=original_filename,
        file_path=file_path,
        extracted_text=extracted_text if extracted_text else None,
        page_count=page_count,
        content_hash=content_hash,
    )
    session.add(document)
    try:
        await session.commit()
    except IntegrityError as exc:
        # The unique constraint, not the check above, is what actually holds:
        # two concurrent uploads of the same file both pass the pre-check.
        await session.rollback()
        _discard_file(file_path)
        raise DuplicateDocumentError(
            f"{original_filename} has already been added to this conversation."
        ) from exc

    await session.refresh(document)
    return document


def _discard_file(file_path: str) -> None:
    """Remove a file from disk, tolerating its absence."""
    try:
        os.remove(file_path)
    except OSError:
        logger.warning("Could not remove file from disk", path=file_path)


async def get_document(session: AsyncSession, document_id: str) -> Document | None:
    """Get a document by its ID."""
    stmt = select(Document).where(Document.id == document_id)
    result = await session.execute(stmt)
    return result.scalar_one_or_none()


async def delete_document(session: AsyncSession, document_id: str) -> bool:
    """Delete a document and its file. Returns True if it existed.

    The row is the source of truth, so a missing file on disk is logged rather
    than failing the request.
    """
    document = await get_document(session, document_id)
    if document is None:
        return False

    file_path = document.file_path
    await session.delete(document)
    await session.commit()
    _discard_file(file_path)

    logger.info("Deleted document", document_id=document_id, path=file_path)
    return True


async def get_documents_for_conversation(
    session: AsyncSession, conversation_id: str
) -> list[Document]:
    """Get every document attached to a conversation, oldest first.

    Upload order is stable and meaningful — it is the order documents are
    numbered in the prompt, so citation indices stay consistent between turns.
    """
    stmt = (
        select(Document)
        .where(Document.conversation_id == conversation_id)
        .order_by(Document.uploaded_at.asc())
    )
    result = await session.execute(stmt)
    return list(result.scalars().all())
