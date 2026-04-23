// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getStoredSession,
  storeSession,
  clearStoredSession,
  getAuthHeaders,
  clearSession,
  type StoredSession,
} from "@/lib/session";

const SESSION: StoredSession = {
  token: "test-jwt-token",
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
  it("returns Bearer token when session has a token", () => {
    storeSession(SESSION);
    expect(getAuthHeaders()).toEqual({ Authorization: "Bearer test-jwt-token" });
  });

  it("falls back to X-User-Id when no session", () => {
    const headers = getAuthHeaders();
    expect(headers).toHaveProperty("X-User-Id");
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
