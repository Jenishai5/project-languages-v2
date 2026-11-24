"""add concepts lessons and user settings

Revision ID: a5367c19e22f
Revises: d45baa68140c
Create Date: 2026-11-24 15:30:27.814764
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = 'a5367c19e22f'
down_revision: str | None = 'd45baa68140c'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table('concepts',
    sa.Column('id', sa.Integer(), sa.Identity(always=False), nullable=False),
    sa.Column('slug', sa.String(length=100), nullable=False),
    sa.Column('category', sa.String(length=64), nullable=False),
    sa.Column('emoji', sa.String(length=16), nullable=True),
    sa.Column('image_url', sa.Text(), nullable=True),
    sa.Column('image_approved', sa.Boolean(), server_default=sa.text('false'), nullable=False),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('slug')
    )
    op.create_index(op.f('ix_concepts_category'), 'concepts', ['category'], unique=False)
    op.create_table('lessons',
    sa.Column('id', sa.Integer(), sa.Identity(always=False), nullable=False),
    sa.Column('slug', sa.String(length=100), nullable=False),
    sa.Column('title', sa.String(length=100), nullable=False),
    sa.Column('position', sa.Integer(), nullable=False),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('position'),
    sa.UniqueConstraint('slug')
    )
    op.create_table('user_settings',
    sa.Column('user_id', sa.Uuid(), nullable=False),
    sa.Column('native_lang', sa.String(length=8), nullable=False),
    sa.Column('learning_lang', sa.String(length=8), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint('native_lang <> learning_lang', name='different_languages'),
    sa.PrimaryKeyConstraint('user_id')
    )
    op.create_table('concept_terms',
    sa.Column('concept_id', sa.Integer(), nullable=False),
    sa.Column('lang', sa.String(length=8), nullable=False),
    sa.Column('text', sa.Text(), nullable=False),
    sa.ForeignKeyConstraint(['concept_id'], ['concepts.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('concept_id', 'lang')
    )
    op.create_table('lesson_concepts',
    sa.Column('lesson_id', sa.Integer(), nullable=False),
    sa.Column('concept_id', sa.Integer(), nullable=False),
    sa.Column('position', sa.Integer(), nullable=False),
    sa.ForeignKeyConstraint(['concept_id'], ['concepts.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['lesson_id'], ['lessons.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('lesson_id', 'concept_id')
    )
    op.create_table('lesson_sentences',
    sa.Column('lesson_id', sa.Integer(), nullable=False),
    sa.Column('sentence_id', sa.BigInteger(), nullable=False),
    sa.Column('concept_id', sa.Integer(), nullable=False),
    sa.ForeignKeyConstraint(['concept_id'], ['concepts.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['lesson_id'], ['lessons.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['sentence_id'], ['sentences.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('lesson_id', 'sentence_id')
    )
    op.create_index(op.f('ix_lesson_sentences_concept_id'), 'lesson_sentences', ['concept_id'], unique=False)
    op.drop_constraint('valid_item_type', 'user_progress', type_='check')
    op.create_check_constraint('valid_item_type', 'user_progress', "item_type IN ('sentence', 'word', 'lesson')")


def downgrade() -> None:
    op.execute("DELETE FROM user_progress WHERE item_type = 'lesson'")
    op.drop_constraint('valid_item_type', 'user_progress', type_='check')
    op.create_check_constraint('valid_item_type', 'user_progress', "item_type IN ('sentence', 'word')")
    op.drop_index(op.f('ix_lesson_sentences_concept_id'), table_name='lesson_sentences')
    op.drop_table('lesson_sentences')
    op.drop_table('lesson_concepts')
    op.drop_table('concept_terms')
    op.drop_table('user_settings')
    op.drop_table('lessons')
    op.drop_index(op.f('ix_concepts_category'), table_name='concepts')
    op.drop_table('concepts')
