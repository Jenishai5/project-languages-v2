import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";
import StaffRoom from "./StaffRoom";

const agent = (name: string, calls: number, failures = 0) => ({
  agent: name, calls, failures, failure_rate: calls ? failures / calls : 0, tokens: calls * 100, learners: calls ? 1 : 0,
  models: calls ? ["openrouter/free"] : [], last_call_at: calls ? new Date().toISOString() : null,
  daily: calls ? [{ day: new Date().toISOString().slice(0, 10), calls, failures, tokens: calls * 100 }] : [],
});

function mockFetch(status: number, body: unknown) {
  const fetchMock = vi.fn(async (url: string) => ({ url, ok: status < 400, status, json: async () => body }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderPage() {
  return render(<MemoryRouter><StaffRoom /></MemoryRouter>);
}

afterEach(() => vi.unstubAllGlobals());

test("shows totals and opens a teacher's metrics on click", async () => {
  const fetchMock = mockFetch(200, {
    days: 7, generated_at: new Date().toISOString(),
    agents: [agent("grammar", 12, 4), agent("vocabulary", 3), agent("conversation", 5), agent("pronunciation", 0), agent("cultural", 0)],
  });
  renderPage();

  expect(await screen.findByText("20 AI answers")).toBeInTheDocument();
  expect(String(fetchMock.mock.calls[0][0])).toContain("/api/agents/usage/summary?days=7");

  fireEvent.click(screen.getByRole("button", { name: /Greta, Grammar teacher: 12 calls, 4 failed/ }));

  const panel = screen.getByRole("complementary");
  expect(within(panel).getByText("Greta")).toBeInTheDocument();
  expect(within(panel).getByText(/Tired: more than 1 in 5 calls failed/)).toBeInTheDocument();
  expect(within(panel).getByText("Calls per day")).toBeInTheDocument();
});

test("the table view lists every agent", async () => {
  mockFetch(200, {
    days: 7, generated_at: new Date().toISOString(),
    agents: ["grammar", "vocabulary", "conversation", "pronunciation", "cultural"].map(name => agent(name, 0)),
  });
  renderPage();

  expect(await screen.findByText(/The teachers are reading at their desks/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Table" }));
  expect(screen.getAllByRole("row")).toHaveLength(6);
});

test("explains the admin setting when the API says 403", async () => {
  mockFetch(403, { detail: "Only admins can see AI usage for the whole app." });
  renderPage();

  expect(await screen.findByText("This room is for admins")).toBeInTheDocument();
  expect(screen.getByText("ADMIN_EMAILS")).toBeInTheDocument();
});

test("offers a retry when loading fails", async () => {
  mockFetch(500, {});
  renderPage();

  expect(await screen.findByRole("alert")).toHaveTextContent("Request failed (500)");
  expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
});
