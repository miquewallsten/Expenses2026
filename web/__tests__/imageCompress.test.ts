import { describe, it, expect } from "vitest";
import { compressImageFile } from "@/lib/imageCompress";

// jsdom does NOT decode images on a real canvas, so the "actually re-encode"
// branch is impossible to exercise in a unit test — that path is browser-only
// and is verified via QA. These tests pin the skip-paths so we don't
// silently break the "always-fall-back-to-original" contract.
describe("compressImageFile", () => {
  it("returns the original File for non-image MIME types (PDF)", async () => {
    const f = new File([new Uint8Array(1024 * 1024)], "receipt.pdf", { type: "application/pdf" });
    const out = await compressImageFile(f);
    expect(out).toBe(f);
  });

  it("returns the original File for CFDI XML uploads", async () => {
    const f = new File(["<cfdi/>"], "receipt.xml", { type: "application/xml" });
    const out = await compressImageFile(f);
    expect(out).toBe(f);
  });

  it("returns the original File for small images (<512 KB)", async () => {
    // 100 KB — below the MIN_BYTES_TO_COMPRESS threshold, never touched.
    const f = new File([new Uint8Array(100 * 1024)], "small.jpg", { type: "image/jpeg" });
    const out = await compressImageFile(f);
    expect(out).toBe(f);
  });

  it("returns the original File when type metadata is missing", async () => {
    const f = new File([new Uint8Array(2 * 1024 * 1024)], "blob.bin", { type: "" });
    const out = await compressImageFile(f);
    expect(out).toBe(f);
  });
});
