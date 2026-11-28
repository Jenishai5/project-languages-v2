"""idempotency keys

Revision ID: 7b1e4c2d9a10
Revises: f623e316ff72
Create Date: 2026-11-28 07:30:00.000000
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = '7b1e4c2d9a10'
down_revision: str | None = 'f623e316ff72'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table('idempotency_keys',
    sa.Column('user_id', sa.Uuid(), nullable=False),
    sa.Column('key', sa.String(length=100), nullable=False),
    sa.Column('operation', sa.String(length=64), nullable=False),
    sa.Column('fingerprint', sa.String(length=64), nullable=False),
    sa.Column('result_id', sa.Integer(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.PrimaryKeyConstraint('user_id', 'key')
    )
    op.create_index('ix_idempotency_keys_created', 'idempotency_keys', ['created_at'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_idempotency_keys_created', table_name='idempotency_keys')
    op.drop_table('idempotency_keys')
