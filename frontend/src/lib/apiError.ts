interface FieldProblem {
  loc?: unknown[];
  msg?: unknown;
}

const LOCATIONS = new Set(["body", "query", "path", "header"]);

function describeProblem(problem: FieldProblem): string | null {
  if (typeof problem.msg !== "string") return null;
  const field = (problem.loc ?? []).filter(part => !LOCATIONS.has(String(part))).join(".");
  return field ? `${field}: ${problem.msg}` : problem.msg;
}

export function errorMessage(data: unknown, status: number): string {
  const detail = (data as { detail?: unknown; error?: unknown } | null)?.detail;
  if (typeof detail === "string" && detail) return detail;
  if (Array.isArray(detail)) {
    const problems = detail.map(item => describeProblem(item as FieldProblem)).filter(Boolean);
    if (problems.length) return problems.join("; ");
  }
  const error = (data as { error?: unknown } | null)?.error;
  if (typeof error === "string" && error) return error;
  return `Request failed (${status})`;
}
