"""add mnemonics

Revision ID: c00d081a5639
Revises: a5367c19e22f
Create Date: 2026-11-25 12:56:31.727292
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = 'c00d081a5639'
down_revision: str | None = 'a5367c19e22f'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table('mnemonics',
    sa.Column('id', sa.Integer(), sa.Identity(always=False), nullable=False),
    sa.Column('user_id', sa.Uuid(), nullable=False),
    sa.Column('concept_id', sa.Integer(), nullable=False),
    sa.Column('learning_lang', sa.String(length=8), nullable=False),
    sa.Column('native_lang', sa.String(length=8), nullable=False),
    sa.Column('text', sa.Text(), nullable=False),
    sa.Column('image_path', sa.Text(), nullable=True),
    sa.Column('text_model', sa.String(length=200), nullable=False),
    sa.Column('image_model', sa.String(length=200), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint('length(text) > 0', name='text_not_empty'),
    sa.CheckConstraint('native_lang <> learning_lang', name='different_languages'),
    sa.ForeignKeyConstraint(['concept_id'], ['concepts.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('user_id', 'concept_id', 'learning_lang', 'native_lang', name='uq_mnemonic_per_user_word')
    )
    op.create_index('ix_mnemonics_user_created', 'mnemonics', ['user_id', 'created_at'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_mnemonics_user_created', table_name='mnemonics')
    op.drop_table('mnemonics')
