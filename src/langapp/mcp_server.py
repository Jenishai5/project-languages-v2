from mcp.server.mcpserver import MCPServer
from mcp.types import ToolAnnotations

from langapp.config import get_settings
from langapp.db.session import make_engine, make_session_factory
from langapp.services.insights import Insights

READ_ONLY = ToolAnnotations(read_only_hint=True, destructive_hint=False, idempotent_hint=True, open_world_hint=False)

server = MCPServer(
    "turtletalk-dev",
    instructions=(
        "Read-only view of the TurtleTalk learning database for development: lessons, lesson words, "
        "a learner's weakest words, saved learning outcomes and AI usage. It cannot change any data."
    ),
)
_insights: Insights | None = None


def insights() -> Insights:
    global _insights
    if _insights is None:
        _insights = Insights(make_session_factory(make_engine(get_settings().database_url)))
    return _insights


@server.tool(annotations=READ_ONLY)
def list_lessons(learning: str = "eng", native: str = "spa") -> list[dict]:
    """List the lessons for a language pair (codes like eng, spa, rus, cat)."""
    return insights().lessons(learning, native)


@server.tool(annotations=READ_ONLY)
def get_lesson_words(lesson_id: int, learning: str = "eng", native: str = "spa") -> list[dict]:
    """Return the words of one lesson with their translations."""
    return insights().lesson_words(lesson_id, learning, native)


@server.tool(annotations=READ_ONLY)
def get_weak_vocabulary(user_id: str, learning: str = "eng", native: str = "spa", limit: int = 5) -> list[dict]:
    """Return the words a learner gets wrong most often (from user_progress)."""
    return insights().weak_words(user_id, learning, native, limit)


@server.tool(annotations=READ_ONLY)
def get_learning_history(user_id: str, limit: int = 20) -> list[dict]:
    """Return a learner's latest saved learning outcomes: mistakes, words used, scores. Never chat text."""
    return insights().recent_outcomes(user_id, limit)


@server.tool(annotations=READ_ONLY)
def get_ai_usage(days: int = 7) -> list[dict]:
    """Return AI calls per day, agent and model, with failures, tokens and the number of learners."""
    return insights().ai_usage(days)


def main() -> None:
    server.run("stdio")


if __name__ == "__main__":
    main()
