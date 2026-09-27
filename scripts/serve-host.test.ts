import { describe, it, expect, afterEach } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { serverHost } from "./local-bin.js";

/**
 * Where the builder listens. `npm start` and the launcher were bound to
 * loopback for NVX-003 while `npm run dev` stayed a bare `next dev`, which
 * listened on every interface and was the last step of the install guide.
 * Nothing failed, because nothing checked all three; this does.
 */

const ROOT = join(__dirname, "..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");
const saved = process.env.HOST;

afterEach(() => {
  if (saved === undefined) delete process.env.HOST;
  else process.env.HOST = saved;
});

describe("the host a server binds", () => {
  it("is loopback unless somebody says otherwise", () => {
    delete process.env.HOST;
    expect(serverHost()).toEqual({ host: "127.0.0.1", loopback: true });
  });

  it("follows HOST, and knows when that has left the machine", () => {
    process.env.HOST = "0.0.0.0";
    expect(serverHost()).toEqual({ host: "0.0.0.0", loopback: false });
    process.env.HOST = "localhost";
    expect(serverHost().loopback).toBe(true);
  });

  it("judges a host given on the command line by the same list", () => {
    process.env.HOST = "127.0.0.1";
    expect(serverHost("0.0.0.0")).toEqual({ host: "0.0.0.0", loopback: false });
    expect(serverHost("::1").loopback).toBe(true);
  });
});

describe("every way of starting it", () => {
  const scripts = JSON.parse(read("package.json")).scripts as Record<string, string>;

  it("goes through a script that names the host", () => {
    expect(scripts.dev).toBe("node scripts/dev.js");
    expect(scripts.start).toBe("node scripts/start.js");
    expect(read("scripts/dev.js")).toMatch(/\["dev", "-H", host, \.\.\.args\]/);
    expect(read("scripts/start.js")).toMatch(/\["start", "-H", host, /);
    expect(read("electron/server.js")).toMatch(/serverHost\(\)/);
  });

  it("warns before it answers on the network", () => {
    for (const file of ["scripts/dev.js", "scripts/start.js"]) {
      expect(read(file)).toMatch(/if \(!loopback\) exposureWarning\(host\)/);
    }
  });
});
