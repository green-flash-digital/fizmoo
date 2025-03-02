import {
  default as esbuild,
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
import { bootstrap, LOG } from "./_fizmoo.utils.js";
import { IsoScribeLogLevel } from "isoscribe";
import { confirm } from "@inquirer/prompts";

export async function createFizmoo(options: {
  logLevel?: IsoScribeLogLevel;
  env?: "development" | "production";
  autoInit: boolean;
}) {
  // Set some options based upon the defaults
  const logLevel: IsoScribeLogLevel =
    (process.env.FIZMOO_LOG_LEVEL as IsoScribeLogLevel) ??
    options.logLevel ??
    "info";
  process.env.FIZMOO_ENV =
    options.env ?? process.env.FIZMOO_ENV ?? "development";

  LOG.logLevel = logLevel;

  LOG.debug("Locating the .fizmoo directory & config.json");
  // Get the configuration from the .fizmoo directory
  const dotDir = new DotDir<FizmooConfig>(); // included in this closure since build is a one time thing
  const dirRes = await tryHandle(dotDir.find)({ dirName: "fizmoo" });
  if (dirRes.data) {
    // Create a new Fizmoo
    LOG.debug("Creating a fizmoo instance");
    const fizmoo = new Fizmoo(dirRes.data);
    return fizmoo;
  }

  LOG.warn(`Unable to located the necessary directories to initialize fizmoo.`);
  let shouldBootstrap = false;

  // If auto init is enabled, then bootstrap the directories
  if (options.autoInit) {
    LOG.debug(
      "AutoInit has been enabled. Bootstrapping the required fizmoo directories and files."
    );
    shouldBootstrap = true;
  }

  // Prompt the user if they would like to bootstrap the directories
  if (!options.autoInit) {
    shouldBootstrap = await confirm({
      message: "Would you like to answer a few prompts to bootstrap fizmoo?",
    });
  }

  if (!shouldBootstrap) {
    return LOG.fatal(dirRes.error);
  }

  const resBootstrap = await tryHandle(bootstrap)();
  if (resBootstrap.hasError) {
    return LOG.fatal(resBootstrap.error);
  }

  // Recursively attempt to create the fizmoo instance again. This should only
  // be called once since we're assuming that the configuration was written successfully
  createFizmoo(options);
}

// Intake the parsed options
export class Fizmoo extends FizmooCommands {
  private _isInDevMode: boolean;

  constructor(args: DotDirResponse<FizmooConfig>) {
    super(args);
    this._init();
    this.build = this.build.bind(this);
    this.dev = this.dev.bind(this);
    this._isInDevMode = false;
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
        this._pluginWatchLogger(),
        this._pluginProcessFilesAndCommands(),
        this._pluginEnrichPackageJSON(),
        this._pluginValidateAndBuildManifest(),
      ].filter((plugin) => !!plugin),
    };
  }

  private _pluginProcessFilesAndCommands(): EsbuildPlugin {
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

  private _pluginEnrichPackageJSON(): EsbuildPlugin {
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

  private _pluginValidateAndBuildManifest(): EsbuildPlugin {
    return {
      name: "esbuild-plugin-buttery-commands-manifest",
      setup: (build) => {
        build.onEnd(async () => {
          await this.buildManifest();
        });
      },
    };
  }

  private _pluginWatchLogger(): EsbuildPlugin | undefined {
    if (!this._isInDevMode) return undefined;

    let isWatching = false; // Track if watch mode is active

    return {
      name: "watch-logger",
      setup(build) {
        build.onEnd((result) => {
          if (!isWatching && result.errors.length === 0) {
            isWatching = true; // Set to true after first successful build
            LOG.watch("Listening for changes");
            return;
          }

          if (isWatching) {
            LOG.debug(`Rebuilding`);
          }
        });
      },
    };
  }

  private async _init() {
    // Clean out the bin dir
    const res = await tryHandle(rm)(this.dirs.binDir, {
      recursive: true,
      force: true,
    });
    if (res.hasError) throw res.error;

    // Create the entry file
    const entryFilePath = path.resolve(this.dirs.binDir, "./index.js");
    const entryFileContent = `import { FizmooRuntime } from "@fizmoo/runtime";
import manifest from "./fizmoo.manifest.json" with { type: "json" };

const runtime = new FizmooRuntime(manifest, { cwd: import.meta.dirname });

try {
  runtime.execute();
} catch (error) {
  runtime.throw(error);
}
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
    LOG.info(`Building "${this.config.name}" CLI...`);
    try {
      const res = await esbuild.build(this.buildConfig);
      LOG.success(`Done!`);
      return res;
    } catch (error) {
      LOG.fatal(new Error(String(error)));
    }
  }

  /**
   * Built in method that will build the manifest outright
   * using the this.buildConfig
   */
  async dev() {
    try {
      this._isInDevMode = true;
      const context = await esbuild.context(this.buildConfig);
      await context.watch();
    } catch (error) {
      this._isInDevMode = false;
      throw new Error(String(error));
    }
  }
}
