import "@testing-library/jest-dom";
import { beforeEach } from "vitest";

// Node 25 exposes a native localStorage (backed by --localstorage-file) that
// lacks the full Storage interface (e.g. .clear() is missing).  Replace it with
// a lightweight in-memory implementation so every test file can rely on the
// standard Web Storage API without needing its own stub.
// We use Object.defineProperty (not vi.stubGlobal) so that vi.unstubAllGlobals()
// in afterEach hooks does not revert to the broken Node 25 native implementation.
const _localStorageStore: Record<string, string> = {};
const localStorageMock: Storage = {
  get length() { return Object.keys(_localStorageStore).length; },
  key: (i) => Object.keys(_localStorageStore)[i] ?? null,
  getItem: (k) => _localStorageStore[k] ?? null,
  setItem: (k, v) => { _localStorageStore[k] = String(v); },
  removeItem: (k) => { delete _localStorageStore[k]; },
  clear: () => { Object.keys(_localStorageStore).forEach((k) => delete _localStorageStore[k]); },
};
Object.defineProperty(globalThis, "localStorage", {
  value: localStorageMock,
  writable: true,
  configurable: true,
});

beforeEach(() => localStorage.clear());

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));

// Mock next-intl
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "es",
}));
