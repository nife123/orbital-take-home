"""Reject byte-identical documents within a conversation

Revision ID: 003_content_hash
Revises: 002_citations
Create Date: 2026-07-27 00:00:00.000000
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "003_content_hash"
down_revision: str | None = "002_citations"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Nullable: documents uploaded before this revision have no hash. Postgres
    # treats NULLs as distinct in a unique constraint, so those rows never
    # collide with each other and the constraint applies cleanly to existing data.
    op.add_column(
        "documents",
        sa.Column("content_hash", sa.String(), nullable=True),
    )
    op.create_unique_constraint(
        "uq_document_content",
        "documents",
        ["conversation_id", "content_hash"],
    )


def downgrade() -> None:
    op.drop_constraint("uq_document_content", "documents", type_="unique")
    op.drop_column("documents", "content_hash")
