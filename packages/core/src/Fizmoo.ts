import {
  build as esbuild,
  BuildOptions,
  Plugin as EsbuildPlugin,
} from "esbuild";
import { readFile, rm, writeFile } from "node:fs/promises";
import { FizmooCommands } from "./FizmooCommands.js";
import { DotDir, DotDirResponse } from "dotdir";
import { tryHandle } from "ts-jolt/isomorphic";
import { writeFileRecursive } from "ts-jolt/node";
import path from "node:path";
import { FizmooConfig } from "./_fizmoo.config.js";
import { LOG } from "./_fizmoo.utils.js";
import { IsoScribeLogLevel } from "isoscribe";

export async function createFizmoo(options: {
  logLevel?: IsoScribeLogLevel;
  env?: "development" | "production";
}) {
  // Set some options based upon the defaults
  const logLevel: IsoScribeLogLevel =
    (process.env.FIZMOO_LOG_LEVEL as IsoScribeLogLevel) ??
    options.logLevel ??
    "info";
  process.env.FIZMOO_ENV =
    options.env ?? process.env.FIZMOO_ENV ?? "development";

  LOG.logLevel = logLevel;

  // Get the configuration from the .fizmoo directory
  const dotDir = new DotDir<FizmooConfig>(); // included in this closure since build is a one time thing
  const res = await dotDir.find({ dirName: "fizmoo" });

  // Create a new Fizmoo
  const fizmoo = new Fizmoo(res);
  return fizmoo;
}

// Intake the parsed options
export class Fizmoo extends FizmooCommands {
  constructor(args: DotDirResponse<FizmooConfig>) {
    super(args);
    this.init();
    this.build = this.build.bind(this);
  }

  get buildConfig(): BuildOptions {
    return {
      bundle: true,
      minify: process.env.FIZMOO_ENV === "production",
      format: "esm",
      platform: "node",
      target: ["node23.3.0"],
      packages: "external",
      logOverride: {
        "empty-glob": "silent",
      },
      entryPoints: this.entryPoints,
      outdir: this.dirs.outDir,
      plugins: [
        this.pluginProcessFilesAndCommands(),
        this.pluginEnrichPackageJSON(),
        this.pluginValidateAndBuildManifest(),
      ],
    };
  }

  private pluginProcessFilesAndCommands(): EsbuildPlugin {
    return {
      name: "esbuild-plugin-buttery-commands-parse",
      setup: (build) => {
        build.onLoad({ filter: /.*/, namespace: "file" }, async (args) => {
          // load the command
          await this.processFile(args.path);
          return null;
        });
      },
    };
  }

  private pluginEnrichPackageJSON(): EsbuildPlugin {
    return {
      name: "esbuild-plugin-buttery-commands-enrich-pkgjson",
      setup: (build) => {
        build.onStart(async () => {
          const packageJsonString = await readFile(this.dirs.packageJsonPath, {
            encoding: "utf8",
          });
          const packageJson = JSON.parse(packageJsonString);
          const packageJsonCLIProperties = {
            type: "module",
            bin: {
              [this.config.name]: "./bin/index.js",
            },
          };
          const packageJsonPropertiesEntries = Object.entries(
            packageJsonCLIProperties
          );
          for (const [key, value] of packageJsonPropertiesEntries) {
            if (!(key in packageJson)) {
              LOG.debug(`Adding '${key}' to package.json file.`);
              packageJson[key] = value;
            }
          }
          await writeFile(
            this.dirs.packageJsonPath,
            `${JSON.stringify(packageJson, null, 2)}\n`,
            "utf-8"
          );
        });
      },
    };
  }

  private pluginValidateAndBuildManifest(): EsbuildPlugin {
    return {
      name: "esbuild-plugin-buttery-commands-manifest",
      setup: (build) => {
        build.onEnd(async () => {
          await this.buildManifest();
        });
      },
    };
  }

  private async init() {
    // Clean out the bin dir
    const res = await tryHandle(rm)(this.dirs.binDir, {
      recursive: true,
      force: true,
    });
    if (res.hasError) throw res.error;

    // Create the entry file
    const entryFilePath = path.resolve(this.dirs.binDir, "./index.js");
    const entryFileContent = `import run from "@fizmoo/runtime";
import manifest from "./fizmoo.manifest.js";

// run the CLI against the manifest
run(manifest, { cwd: import.meta.dirname });
`;
    const entryRes = await tryHandle(writeFileRecursive)(
      entryFilePath,
      entryFileContent
    );
    if (entryRes.hasError) throw res.error;
  }

  /**
   * Built in method that will build the manifest outright
   * using the this.buildConfig
   */
  async build() {
    try {
      const res = await esbuild(this.buildConfig);
      return res;
    } catch (error) {
      throw new Error(String(error));
    }
  }
}
