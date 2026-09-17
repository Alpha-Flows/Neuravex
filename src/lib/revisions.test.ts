import { describe, it, expect } from "vitest";
import { decideRevisionAction, AUTOSAVE_COALESCE_MS, LatestRevision } from "@/lib/revisions";

const NOW = new Date("2026-01-01T12:00:00Z").getTime();

const latest = (over: Partial<LatestRevision> = {}): LatestRevision => ({
  title: "Home",
  content: '[{"id":"a"}]',
  manual: false,
  createdAt: new Date(NOW - 1000),
  ...over,
});

const next = (content: string, manual = false) => ({ title: "Home", content, manual });

describe("decideRevisionAction", () => {
  it("creates the first revision a page ever gets", () => {
    expect(decideRevisionAction(null, next('[{"id":"a"}]'), NOW)).toBe("create");
  });

  it("skips a save that changed nothing", () => {
    expect(decideRevisionAction(latest(), next('[{"id":"a"}]'), NOW)).toBe("skip");
  });

  it("skips even a manual save when the content is identical", () => {
    expect(decideRevisionAction(latest(), next('[{"id":"a"}]', true), NOW)).toBe("skip");
  });

  it("collapses an autosave into the recent autosave before it", () => {
    expect(decideRevisionAction(latest(), next('[{"id":"b"}]'), NOW)).toBe("replace");
  });

  it("starts a new revision once the window has passed", () => {
    const old = latest({ createdAt: new Date(NOW - AUTOSAVE_COALESCE_MS - 1) });
    expect(decideRevisionAction(old, next('[{"id":"b"}]'), NOW)).toBe("create");
  });

  it("gives every manual save its own revision", () => {
    expect(decideRevisionAction(latest(), next('[{"id":"b"}]', true), NOW)).toBe("create");
  });

  it("never overwrites a manual save with an autosave", () => {
    const saved = latest({ manual: true });
    expect(decideRevisionAction(saved, next('[{"id":"b"}]'), NOW)).toBe("create");
  });

  it("treats a title-only change as a change", () => {
    const renamed = { title: "About", content: '[{"id":"a"}]', manual: true };
    expect(decideRevisionAction(latest(), renamed, NOW)).toBe("create");
  });
});
