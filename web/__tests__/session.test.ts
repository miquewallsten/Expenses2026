// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getStoredSession,
  storeSession,
  clearStoredSession,
  getAuthHeaders,
  clearSession,
  decodeJwtPayload,
  isSessionExpired,
  type StoredSession,
} from "@/lib/session";

function makeJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(
    JSON.stringify({ alg: "HS256", typ: "JWT" }),
  ).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${header}.${body}.sig`;
}

// Far-future exp so existing tests continue to pass.
const FAR_FUTURE_TOKEN = makeJwt({ sub: "42", exp: 9999999999 });

const SESSION: StoredSession = {
  token: FAR_FUTURE_TOKEN,
  userId: 42,
  email: "user@example.com",
  role: "employee",
  companyId: 1,
  fullName: "Test User",
};

// Lightweight in-memory localStorage mock
const store: Record<string, string> = {};
const localStorageMock: Storage = {
  getItem: (key) => store[key] ?? null,
  setItem: (key, val) => { store[key] = val; },
  removeItem: (key) => { delete store[key]; },
  clear: () => { Object.keys(store).forEach((k) => delete store[k]); },
  get length() { return Object.keys(store).length; },
  key: (i) => Object.keys(store)[i] ?? null,
};

beforeEach(() => {
  vi.stubGlobal("localStorage", localStorageMock);
  localStorageMock.clear();
});

describe("getStoredSession", () => {
  it("returns null when nothing is stored", () => {
    expect(getStoredSession()).toBeNull();
  });

  it("returns the stored session", () => {
    storeSession(SESSION);
    expect(getStoredSession()).toEqual(SESSION);
  });

  it("returns null on malformed JSON", () => {
    localStorage.setItem("session", "not-json{");
    expect(getStoredSession()).toBeNull();
  });
});

describe("getAuthHeaders", () => {
  it("returns Bearer token when session has a valid, unexpired token", () => {
    storeSession(SESSION);
    expect(getAuthHeaders()).toEqual({ Authorization: `Bearer ${FAR_FUTURE_TOKEN}` });
  });

  it("falls back to X-User-Id when no session", () => {
    const headers = getAuthHeaders();
    expect(headers).toHaveProperty("X-User-Id");
  });

  it("clears session and returns empty headers when token is expired", () => {
    const expired = makeJwt({ sub: "42", exp: 1 });
    storeSession({ ...SESSION, token: expired });
    // jsdom: assign a noop to prevent navigation crash
    const origLocation = window.location;
    // @ts-expect-error — override for test
    delete window.location;
    // @ts-expect-error — minimal stub
    window.location = { href: "" };
    const headers = getAuthHeaders();
    expect(headers).toEqual({});
    expect(getStoredSession()).toBeNull();
    // @ts-expect-error — restore
    window.location = origLocation;
  });
});

describe("decodeJwtPayload", () => {
  it("decodes a valid JWT payload", () => {
    expect(decodeJwtPayload(FAR_FUTURE_TOKEN)).toEqual({ sub: "42", exp: 9999999999 });
  });

  it("returns null for malformed input", () => {
    expect(decodeJwtPayload("junk")).toBeNull();
    expect(decodeJwtPayload("a.b")).toBeNull();
  });
});

describe("isSessionExpired", () => {
  it("returns true for expired token", () => {
    expect(isSessionExpired(makeJwt({ exp: 1 }))).toBe(true);
  });

  it("returns false for a far-future token", () => {
    expect(isSessionExpired(FAR_FUTURE_TOKEN)).toBe(false);
  });

  it("returns false when exp claim is missing", () => {
    expect(isSessionExpired(makeJwt({ sub: "x" }))).toBe(false);
  });

  it("returns true for malformed token", () => {
    expect(isSessionExpired("junk")).toBe(true);
  });
});

describe("clearSession", () => {
  it("removes session from localStorage", () => {
    storeSession(SESSION);
    clearSession();
    expect(getStoredSession()).toBeNull();
  });
});

describe("clearStoredSession", () => {
  it("removes only the session key", () => {
    storeSession(SESSION);
    localStorage.setItem("other", "data");
    clearStoredSession();
    expect(getStoredSession()).toBeNull();
    expect(localStorage.getItem("other")).toBe("data");
  });
});
