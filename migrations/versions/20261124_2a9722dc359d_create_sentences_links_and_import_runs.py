"""create sentences, links and import runs

Revision ID: 2a9722dc359d
Revises: 
Create Date: 2026-11-24 00:22:17.094920
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = '2a9722dc359d'
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table('import_runs',
    sa.Column('id', sa.Integer(), sa.Identity(always=False), nullable=False),
    sa.Column('source_lang', sa.String(length=8), nullable=False),
    sa.Column('target_langs', sa.String(length=64), nullable=False),
    sa.Column('status', sa.String(length=16), nullable=False),
    sa.Column('started_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('finished_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('pages', sa.Integer(), nullable=False),
    sa.Column('fetched', sa.Integer(), nullable=False),
    sa.Column('inserted', sa.Integer(), nullable=False),
    sa.Column('updated', sa.Integer(), nullable=False),
    sa.Column('skipped', sa.Integer(), nullable=False),
    sa.Column('last_cursor', sa.Text(), nullable=True),
    sa.Column('error', sa.Text(), nullable=True),
    sa.CheckConstraint("status IN ('running', 'succeeded', 'failed')", name='valid_status'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_table('sentences',
    sa.Column('id', sa.BigInteger(), autoincrement=False, nullable=False),
    sa.Column('lang', sa.String(length=8), nullable=False),
    sa.Column('text', sa.Text(), nullable=False),
    sa.Column('license', sa.String(length=64), nullable=True),
    sa.Column('owner', sa.String(length=100), nullable=True),
    sa.Column('is_unapproved', sa.Boolean(), server_default=sa.text('false'), nullable=False),
    sa.Column('first_seen_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_sentences_lang'), 'sentences', ['lang'], unique=False)
    op.create_table('sentence_links',
    sa.Column('sentence_id', sa.BigInteger(), nullable=False),
    sa.Column('translation_id', sa.BigInteger(), nullable=False),
    sa.Column('is_direct', sa.Boolean(), nullable=False),
    sa.CheckConstraint('sentence_id <> translation_id', name='no_self_link'),
    sa.ForeignKeyConstraint(['sentence_id'], ['sentences.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['translation_id'], ['sentences.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('sentence_id', 'translation_id')
    )
    op.create_index(op.f('ix_sentence_links_translation_id'), 'sentence_links', ['translation_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_sentence_links_translation_id'), table_name='sentence_links')
    op.drop_table('sentence_links')
    op.drop_index(op.f('ix_sentences_lang'), table_name='sentences')
    op.drop_table('sentences')
    op.drop_table('import_runs')
