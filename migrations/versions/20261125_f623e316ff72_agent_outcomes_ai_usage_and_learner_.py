"""agent outcomes, ai usage and learner level

Revision ID: f623e316ff72
Revises: 18d172320c46
Create Date: 2026-11-25 22:36:31.772339
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = 'f623e316ff72'
down_revision: str | None = '18d172320c46'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table('ai_usage',
    sa.Column('id', sa.Integer(), sa.Identity(always=False), nullable=False),
    sa.Column('user_id', sa.Uuid(), nullable=False),
    sa.Column('agent', sa.String(length=32), nullable=False),
    sa.Column('model', sa.String(length=200), nullable=False),
    sa.Column('succeeded', sa.Boolean(), nullable=False),
    sa.Column('tokens', sa.Integer(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_ai_usage_user_created', 'ai_usage', ['user_id', 'created_at'], unique=False)
    op.create_table('learning_outcomes',
    sa.Column('id', sa.Integer(), sa.Identity(always=False), nullable=False),
    sa.Column('user_id', sa.Uuid(), nullable=False),
    sa.Column('agent', sa.String(length=32), nullable=False),
    sa.Column('kind', sa.String(length=32), nullable=False),
    sa.Column('lesson_id', sa.Integer(), nullable=True),
    sa.Column('concept_id', sa.Integer(), nullable=True),
    sa.Column('detail', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    sa.Column('model', sa.String(length=200), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['concept_id'], ['concepts.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['lesson_id'], ['lessons.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_learning_outcomes_user_created', 'learning_outcomes', ['user_id', 'created_at'], unique=False)
    op.add_column('user_settings', sa.Column('level', sa.String(length=2), nullable=True))
    op.create_check_constraint('known_level', 'user_settings', "level IN ('A1', 'A2', 'B1', 'B2', 'C1', 'C2')")


def downgrade() -> None:
    op.drop_constraint('known_level', 'user_settings', type_='check')
    op.drop_column('user_settings', 'level')
    op.drop_index('ix_learning_outcomes_user_created', table_name='learning_outcomes')
    op.drop_table('learning_outcomes')
    op.drop_index('ix_ai_usage_user_created', table_name='ai_usage')
    op.drop_table('ai_usage')
