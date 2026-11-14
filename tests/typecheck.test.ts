import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../", import.meta.url));
const tsc = fileURLToPath(new URL("../node_modules/typescript/bin/tsc", import.meta.url));

function typecheck(project: string) {
  return spawnSync(process.execPath, [tsc, "--noEmit", "--project", project], {
    cwd: root, encoding: "utf8", timeout: 30_000,
  });
}

describe("TypeScript regression checks", () => {
  it("typechecks all reference code, tests, and the React component against the real SDK", () => {
    const result = typecheck("tsconfig.json");
    expect(result.error).toBeUndefined();
    expect(result.status, result.stdout + result.stderr).toBe(0);
  }, 35_000);

  it("before: tsc rejects returning a Response as Promise<string>", () => {
    const result = typecheck("tests/fixtures/tsconfig.original.json");
    expect(result.error).toBeUndefined();
    expect(result.status, result.stdout + result.stderr).toBe(2);
    expect(result.stdout).toContain("TS2322");
    expect(result.stdout).toContain("Type 'Response' is not assignable to type 'string'");
  }, 35_000);
});
