/** Phase 3.2 — API client tests. */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { apiCall, apiPost, HttpError } from "../lib/api/client";

const ORIGINAL_FETCH = globalThis.fetch;

// jsdom in this project doesn't expose a writable Storage by default — mirror
// the pattern from session.test.ts.
const store: Record<string, string> = {};
const localStorageMock: Storage = {
  getItem: (key) => store[key] ?? null,
  setItem: (key, val) => {
    store[key] = val;
  },
  removeItem: (key) => {
    delete store[key];
  },
  clear: () => {
    Object.keys(store).forEach((k) => delete store[k]);
  },
  get length() {
    return Object.keys(store).length;
  },
  key: (i) => Object.keys(store)[i] ?? null,
};

function mockFetch(
  responder: (url: string, init?: RequestInit) => Response | Promise<Response>,
) {
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    return responder(url, init);
  });
  // @ts-expect-error - vitest fn shape
  globalThis.fetch = fn;
  return fn;
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "http://localhost:8000");
  vi.stubGlobal("localStorage", localStorageMock);
  localStorageMock.clear();
});

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("apiCall", () => {
  it("parses JSON success", async () => {
    mockFetch(
      () =>
        new Response(JSON.stringify({ ok: true, value: 42 }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );
    const r = await apiCall<{ value: number }>("/x");
    expect(r.value).toBe(42);
  });

  it("attaches Authorization header from stored session", async () => {
    localStorage.setItem(
      "session",
      JSON.stringify({
        token: "tok123",
        userId: 1,
        email: "x@y",
        role: "user",
        companyId: 1,
        fullName: "X",
      }),
    );
    const fn = mockFetch(
      () =>
        new Response("{}", {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );
    await apiCall("/expenses");
    const init = fn.mock.calls[0]?.[1];
    expect((init?.headers as Headers).get("Authorization")).toBe(
      "Bearer tok123",
    );
  });

  it("skips auth header when authenticated:false", async () => {
    localStorage.setItem(
      "session",
      JSON.stringify({
        token: "tok",
        userId: 1,
        email: "x",
        role: "user",
        companyId: 1,
        fullName: "X",
      }),
    );
    const fn = mockFetch(
      () =>
        new Response(JSON.stringify({}), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );
    await apiCall("/auth/magic-link/request", {
      authenticated: false,
      method: "POST",
      json: { email: "x@y" },
    });
    const init = fn.mock.calls[0]?.[1];
    expect((init?.headers as Headers).get("Authorization")).toBeNull();
    expect((init?.headers as Headers).get("Content-Type")).toBe(
      "application/json",
    );
  });

  it("throws HttpError with structured Phase 2.5 envelope", async () => {
    mockFetch(
      () =>
        new Response(
          JSON.stringify({
            ok: false,
            error: { code: "validation_error", message: "bad", request_id: "rid" },
          }),
          {
            status: 422,
            headers: {
              "Content-Type": "application/json",
              "X-Request-Id": "rid",
            },
          },
        ),
    );
    try {
      await apiCall("/x", { method: "POST", json: {} });
      throw new Error("should not reach");
    } catch (e) {
      expect(e).toBeInstanceOf(HttpError);
      const err = e as HttpError;
      expect(err.status).toBe(422);
      expect(err.code).toBe("validation_error");
      expect(err.message).toBe("bad");
      expect(err.requestId).toBe("rid");
    }
  });

  it("falls back to legacy {detail} shape", async () => {
    mockFetch(
      () =>
        new Response(JSON.stringify({ detail: "not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        }),
    );
    try {
      await apiCall("/x");
    } catch (e) {
      const err = e as HttpError;
      expect(err.status).toBe(404);
      expect(err.message).toBe("not found");
    }
  });

  it("redirects on 401", async () => {
    const original = window.location;
    // jsdom: replace location.href via Object.defineProperty
    delete (window as unknown as { location?: Location }).location;
    (window as unknown as { location: { href: string; pathname: string } }).location =
      { href: "", pathname: "/" } as Location;
    localStorage.setItem("session", "{}");
    mockFetch(() => new Response("{}", { status: 401, headers: { "Content-Type": "application/json" } }));
    try {
      await apiCall("/x");
    } catch {
      /* expected */
    }
    expect(localStorage.getItem("session")).toBeNull();
    expect(window.location.href).toBe("/login");
    (window as unknown as { location: Location }).location = original;
  });

  it("apiPost sends method=POST + JSON body", async () => {
    const fn = mockFetch(
      () =>
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );
    await apiPost("/x", { a: 1 });
    const init = fn.mock.calls[0]?.[1];
    expect(init?.method).toBe("POST");
    expect(init?.body).toBe(JSON.stringify({ a: 1 }));
  });
});
