"""learner sentences and image generation log

Revision ID: 18d172320c46
Revises: c00d081a5639
Create Date: 2026-11-25 14:58:49.938357
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = '18d172320c46'
down_revision: str | None = 'c00d081a5639'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table('image_generations',
    sa.Column('id', sa.Integer(), sa.Identity(always=False), nullable=False),
    sa.Column('user_id', sa.Uuid(), nullable=False),
    sa.Column('model', sa.String(length=200), nullable=False),
    sa.Column('succeeded', sa.Boolean(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_image_generations_user_created', 'image_generations', ['user_id', 'created_at'], unique=False)
    op.alter_column('mnemonics', 'text_model',
               existing_type=sa.VARCHAR(length=200),
               nullable=True)


def downgrade() -> None:
    op.execute("UPDATE mnemonics SET text_model = 'learner' WHERE text_model IS NULL")
    op.alter_column('mnemonics', 'text_model',
               existing_type=sa.VARCHAR(length=200),
               nullable=False)
    op.drop_index('ix_image_generations_user_created', table_name='image_generations')
    op.drop_table('image_generations')
