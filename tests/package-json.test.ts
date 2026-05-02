import { describe, it, expect } from "vitest";
import pkg from "../package.json";

describe("package.json", () => {
  it("should have the correct plugin name", () => {
    expect(pkg.name).toBe("obsidian-feishu-sync");
  });

  it("should have main set to main.js", () => {
    expect(pkg.main).toBe("main.js");
  });

  it("should have obsidian as a devDependency", () => {
    expect(pkg.devDependencies).toHaveProperty("obsidian");
  });

  it("should have typescript as a devDependency", () => {
    expect(pkg.devDependencies).toHaveProperty("typescript");
  });

  it("should have rollup as a devDependency", () => {
    expect(pkg.devDependencies).toHaveProperty("rollup");
  });

  it("should have a dev script", () => {
    expect(pkg.scripts).toHaveProperty("dev");
  });

  it("should have a build script", () => {
    expect(pkg.scripts).toHaveProperty("build");
  });

  it("should have a test script", () => {
    expect(pkg.scripts).toHaveProperty("test");
  });
});
