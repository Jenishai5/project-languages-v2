"""add audios word pairs progress and word count

Revision ID: d45baa68140c
Revises: 2a9722dc359d
Create Date: 2026-11-24 14:33:03.553326
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = 'd45baa68140c'
down_revision: str | None = '2a9722dc359d'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table('user_progress',
    sa.Column('user_id', sa.Uuid(), nullable=False),
    sa.Column('item_type', sa.String(length=16), nullable=False),
    sa.Column('item_key', sa.String(length=255), nullable=False),
    sa.Column('attempts', sa.Integer(), nullable=False),
    sa.Column('correct_count', sa.Integer(), nullable=False),
    sa.Column('mastery_level', sa.SmallInteger(), nullable=False),
    sa.Column('last_attempted_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('next_review_at', sa.DateTime(timezone=True), nullable=False),
    sa.CheckConstraint("item_type IN ('sentence', 'word')", name='valid_item_type'),
    sa.CheckConstraint('mastery_level BETWEEN 0 AND 5', name='valid_mastery'),
    sa.PrimaryKeyConstraint('user_id', 'item_type', 'item_key')
    )
    op.create_table('word_pairs',
    sa.Column('id', sa.Integer(), sa.Identity(always=False), nullable=False),
    sa.Column('pair', sa.String(length=16), nullable=False),
    sa.Column('category', sa.String(length=64), nullable=True),
    sa.Column('source_text', sa.Text(), nullable=False),
    sa.Column('target_text', sa.Text(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('pair', 'source_text', 'target_text', name='uq_word_pair')
    )
    op.create_index(op.f('ix_word_pairs_pair'), 'word_pairs', ['pair'], unique=False)
    op.create_table('audios',
    sa.Column('id', sa.BigInteger(), autoincrement=False, nullable=False),
    sa.Column('sentence_id', sa.BigInteger(), nullable=False),
    sa.Column('download_url', sa.Text(), nullable=False),
    sa.Column('author', sa.String(length=100), nullable=True),
    sa.Column('license', sa.String(length=64), nullable=True),
    sa.Column('attribution_url', sa.Text(), nullable=True),
    sa.Column('recorded_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('source_modified_at', sa.DateTime(timezone=True), nullable=True),
    sa.ForeignKeyConstraint(['sentence_id'], ['sentences.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_audios_sentence_id'), 'audios', ['sentence_id'], unique=False)
    op.add_column('sentences', sa.Column('word_count', sa.SmallInteger(), nullable=True))
    op.execute(
        "UPDATE sentences SET word_count = array_length(regexp_split_to_array(btrim(text), '\\s+'), 1)"
    )


def downgrade() -> None:
    op.drop_column('sentences', 'word_count')
    op.drop_index(op.f('ix_audios_sentence_id'), table_name='audios')
    op.drop_table('audios')
    op.drop_index(op.f('ix_word_pairs_pair'), table_name='word_pairs')
    op.drop_table('word_pairs')
    op.drop_table('user_progress')
