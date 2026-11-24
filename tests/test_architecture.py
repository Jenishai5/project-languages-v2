import ast
from pathlib import Path

import pytest

SRC = Path(__file__).resolve().parent.parent / "src" / "langapp"

RULES = {
    "api/routes": ("langapp.repositories", "langapp.db", "sqlalchemy"),
    "services": ("langapp.api", "fastapi"),
    "repositories": ("langapp.api", "langapp.services", "fastapi"),
    "domain.py": ("langapp.api", "langapp.services", "langapp.repositories", "langapp.db", "sqlalchemy", "fastapi"),
}


def imported_modules(path: Path) -> set[str]:
    tree = ast.parse(path.read_text(encoding="utf-8"))
    modules = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom) and node.module:
            modules.add(node.module)
        elif isinstance(node, ast.Import):
            modules.update(alias.name for alias in node.names)
    return modules


def files_in(layer: str) -> list[Path]:
    target = SRC / layer
    return [target] if target.is_file() else sorted(target.rglob("*.py"))


@pytest.mark.parametrize("layer", RULES)
def test_layers_only_depend_inwards(layer):
    forbidden = RULES[layer]
    broken = [
        f"{path.relative_to(SRC)} imports {module}"
        for path in files_in(layer)
        for module in imported_modules(path)
        if module.startswith(forbidden)
    ]
    assert broken == []
