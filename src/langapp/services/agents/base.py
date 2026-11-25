import uuid
from dataclasses import dataclass

from langapp.services.languages import LANGUAGE_NAMES

LEVELS = ("A1", "A2", "B1", "B2", "C1", "C2")
DEFAULT_LEVEL = "A1"


@dataclass(frozen=True)
class LearnerContext:
    user_id: uuid.UUID
    learning: str
    native: str
    level: str = DEFAULT_LEVEL

    @property
    def learning_name(self) -> str:
        return LANGUAGE_NAMES.get(self.learning, self.learning)

    @property
    def native_name(self) -> str:
        return LANGUAGE_NAMES.get(self.native, self.native)


def model_list(configured: str, fallback: str) -> tuple[str, ...]:
    names = tuple(name.strip() for name in configured.split(",") if name.strip())
    return names or ((fallback,) if fallback else ())
