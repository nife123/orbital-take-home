"""Add verified citations to messages

Revision ID: 002_citations
Revises: 001_initial
Create Date: 2026-07-27 00:00:00.000000
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "002_citations"
down_revision: str | None = "001_initial"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "messages",
        sa.Column("citations", sa.JSON(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("messages", "citations")
