import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import {
  countQueuedUploads,
  drainUploadQueue,
  enqueueUpload,
  listQueuedUploads,
  removeQueuedUpload,
} from "@/lib/offline/uploadQueue";

async function clearAll() {
  const rows = await listQueuedUploads();
  for (const r of rows) await removeQueuedUpload(r.id);
}

describe("offline upload queue", () => {
  afterEach(async () => {
    await clearAll();
  });

  it("enqueues, lists, counts, removes", async () => {
    const blob = new Blob(["hi"], { type: "text/plain" });
    const id = await enqueueUpload({ companyId: 1, filename: "a.xml", blob });
    expect(typeof id).toBe("number");
    expect(await countQueuedUploads()).toBe(1);
    const rows = await listQueuedUploads();
    expect(rows).toHaveLength(1);
    expect(rows[0].filename).toBe("a.xml");
    expect(rows[0].companyId).toBe(1);
    await removeQueuedUpload(rows[0].id);
    expect(await countQueuedUploads()).toBe(0);
  });

  it("drainUploadQueue removes rows the uploader returns true for", async () => {
    await enqueueUpload({ companyId: 1, filename: "ok.xml", blob: new Blob(["x"]) });
    await enqueueUpload({ companyId: 1, filename: "fail.xml", blob: new Blob(["y"]) });
    const seen: string[] = [];
    const result = await drainUploadQueue(async (row) => {
      seen.push(row.filename);
      return row.filename === "ok.xml";
    });
    expect(seen).toEqual(["ok.xml", "fail.xml"]);
    expect(result.sent).toBe(1);
    expect(result.failed).toBe(1);
    // failure stops the drain — second row should still be present
    expect(result.remaining).toBe(1);
    const remaining = await listQueuedUploads();
    expect(remaining[0].filename).toBe("fail.xml");
  });

  it("drain stops at first failure (no greedy retry)", async () => {
    await enqueueUpload({ companyId: 1, filename: "first.xml", blob: new Blob(["x"]) });
    await enqueueUpload({ companyId: 1, filename: "second.xml", blob: new Blob(["y"]) });
    const seen: string[] = [];
    await drainUploadQueue(async (row) => {
      seen.push(row.filename);
      return false;
    });
    expect(seen).toEqual(["first.xml"]);
    expect(await countQueuedUploads()).toBe(2);
  });

  it("drain skips when navigator reports offline", async () => {
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    await enqueueUpload({ companyId: 1, filename: "x.xml", blob: new Blob(["z"]) });
    const result = await drainUploadQueue(async () => true);
    expect(result.sent).toBe(0);
    expect(result.remaining).toBe(1);
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
  });

  it("dispatches opsflow:queue-changed on enqueue and remove", async () => {
    let count = 0;
    const handler = () => {
      count += 1;
    };
    window.addEventListener("opsflow:queue-changed", handler);
    const id = await enqueueUpload({ companyId: 1, filename: "evt.xml", blob: new Blob(["q"]) });
    await removeQueuedUpload(id);
    window.removeEventListener("opsflow:queue-changed", handler);
    expect(count).toBe(2);
  });
});
