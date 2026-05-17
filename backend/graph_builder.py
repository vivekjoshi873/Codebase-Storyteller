import ast
import os
import re
from pathlib import Path


def _python_imports(filepath: str, content: str) -> list[dict]:
    edges: list[dict] = []
    try:
        tree = ast.parse(content)
    except SyntaxError:
        return edges

    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                module = alias.name.split(".")[0]
                edges.append({"from": filepath, "to": module})
        elif isinstance(node, ast.ImportFrom) and node.module:
            module = node.module.split(".")[0]
            edges.append({"from": filepath, "to": module})
    return edges


def _typescript_imports(filepath: str, content: str) -> list[dict]:
    edges: list[dict] = []
    pattern = re.compile(
        r"""import\s+(?:[\w*{}\s,]+\s+from\s+)?['"]([^'"]+)['"]""",
        re.MULTILINE,
    )
    for match in pattern.finditer(content):
        target = match.group(1)
        edges.append({"from": filepath, "to": target})
    return edges


def _dedupe_nodes(nodes: list[dict]) -> list[dict]:
    seen: set[str] = set()
    unique: list[dict] = []
    for node in nodes:
        if node["id"] not in seen:
            seen.add(node["id"])
            unique.append(node)
    return unique


def _dedupe_edges(edges: list[dict]) -> list[dict]:
    seen: set[tuple[str, str]] = set()
    unique: list[dict] = []
    for edge in edges:
        key = (edge["from"], edge["to"])
        if key not in seen:
            seen.add(key)
            unique.append(edge)
    return unique


def build_graph(repo_path: str) -> dict:
    nodes: list[dict] = []
    edges: list[dict] = []
    repo_root = Path(repo_path)

    for root, _, files in os.walk(repo_path):
        if ".git" in root.split(os.sep):
            continue

        for filename in files:
            full_path = Path(root) / filename
            rel_path = str(full_path.relative_to(repo_root)).replace("\\", "/")
            ext = full_path.suffix.lower()

            if ext not in {".py", ".ts", ".tsx"}:
                continue

            try:
                content = full_path.read_text(encoding="utf-8", errors="ignore")
            except OSError:
                continue

            nodes.append({"id": rel_path, "label": filename})

            if ext == ".py":
                edges.extend(_python_imports(rel_path, content))
            else:
                edges.extend(_typescript_imports(rel_path, content))

    return {
        "nodes": _dedupe_nodes(nodes),
        "edges": _dedupe_edges(edges),
    }
