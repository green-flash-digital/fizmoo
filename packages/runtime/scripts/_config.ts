import type { BuildOptions } from "esbuild";
import path from "node:path";

export const baseConfig: BuildOptions = {
  entryPoints: [path.resolve(import.meta.dirname, "../src/index.ts")],
  outfile: path.resolve(import.meta.dirname, "../dist/index.js"),
  bundle: true,
  minify: true,
  format: "esm",
  platform: "node",
  target: ["node22.13.1"],
  packages: "bundle",
};
