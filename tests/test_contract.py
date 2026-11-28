from pathlib import Path

import pytest
import yaml

from langapp.api.main import app

CONTRACT = yaml.safe_load((Path(__file__).parents[1] / "openapi.yaml").read_text(encoding="utf-8"))
CODE = app.openapi()
OPERATIONS = [
    (path, method, operation)
    for path, operations in CONTRACT["paths"].items()
    for method, operation in operations.items()
]


def resolve(document: dict, schema: dict) -> dict:
    while "$ref" in schema:
        node = document
        for part in schema["$ref"].removeprefix("#/").split("/"):
            node = node[part]
        schema = node
    return schema


def success_schema(document: dict, operation: dict) -> dict | None:
    for status, response in operation.get("responses", {}).items():
        if status.startswith("2"):
            content = resolve(document, response).get("content", {})
            if "application/json" in content:
                return resolve(document, content["application/json"]["schema"])
    return None


@pytest.mark.parametrize(("path", "method", "operation"), OPERATIONS, ids=[f"{m.upper()} {p}" for p, m, _ in OPERATIONS])
def test_code_has_the_same_parameters_as_the_contract(path, method, operation):
    code_operation = CODE["paths"].get(path, {}).get(method)
    assert code_operation is not None, f"{method.upper()} {path} is in openapi.yaml but not in the code"

    contract_params = {(p["in"], p["name"]) for p in (resolve(CONTRACT, p) for p in operation.get("parameters", []))}
    code_params = {(p["in"], p["name"]) for p in code_operation.get("parameters", []) if p["in"] in {"query", "path"}}
    assert contract_params == code_params


@pytest.mark.parametrize(("path", "method", "operation"), OPERATIONS, ids=[f"{m.upper()} {p}" for p, m, _ in OPERATIONS])
def test_code_returns_the_fields_the_contract_promises(path, method, operation):
    contract_schema = success_schema(CONTRACT, operation)
    code_schema = success_schema(CODE, CODE["paths"][path][method])
    if contract_schema is None or "properties" not in contract_schema:
        return

    assert code_schema is not None, f"{method.upper()} {path} has no response model in the code"
    assert set(contract_schema["properties"]) == set(code_schema.get("properties", {}))
    assert set(contract_schema.get("required", [])) <= set(code_schema.get("required", []))


@pytest.mark.parametrize(("path", "method", "operation"), OPERATIONS, ids=[f"{m.upper()} {p}" for p, m, _ in OPERATIONS])
def test_code_accepts_the_request_body_the_contract_describes(path, method, operation):
    if "requestBody" not in operation:
        return
    contract_body = resolve(CONTRACT, operation["requestBody"]["content"]["application/json"]["schema"])
    code_body = resolve(CODE, CODE["paths"][path][method]["requestBody"]["content"]["application/json"]["schema"])

    assert set(contract_body["properties"]) == set(code_body["properties"])
    assert set(contract_body["required"]) == set(code_body["required"])
