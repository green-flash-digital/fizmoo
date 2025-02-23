import {
  build as esbuild,
  BuildOptions,
  Plugin as EsbuildPlugin,
} from "esbuild";
import { readFile, writeFile } from "node:fs/promises";
import { FizmooCommands } from "./FizmooCommands.js";
import { DotDirResponse } from "dotdir";
import { FizmooConfig } from "../schema/schema.js";

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
      minify: true,
      sourcemap: true,
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
          this.processFile(args.path);
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
              // LOG.debug(`Adding '${key}' to package.json file.`);
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
          await this._manifest.validate();
          await this._manifest.build();
        });
      },
    };
  }

  // prebuild
  private init() {
    console.log("Running PREBUILD...");
    console.log("Running PREBUILD... complete.");
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
