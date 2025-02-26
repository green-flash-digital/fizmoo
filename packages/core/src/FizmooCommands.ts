import { DotDirResponse } from "dotdir";
import path from "node:path";
import picomatch from "picomatch";
import { tryHandle } from "ts-jolt/isomorphic";
import { Command, Options } from "./_fizmoo.types.js";
import { FizmooManifest, ManifestEntry } from "./FizmooManifest.js";
import { LOG } from "./_fizmoo.utils.js";
import { FizmooConfig } from "./_fizmoo.config.js";

const defaultOptions: Options = {
  help: {
    type: "boolean",
    required: false,
    alias: "h",
    description: "Display the help menu",
  },
};

type FizmooDirs = {
  commandsDir: string;
  packageJsonPath: string;
  binDir: string;
  outDir: string;
};

export class FizmooCommands {
  protected _manifest: FizmooManifest;
  protected config: DotDirResponse<FizmooConfig>["config"];
  protected meta: Omit<DotDirResponse<FizmooConfig>, "config">["meta"];

  constructor(args: DotDirResponse<FizmooConfig>) {
    this.config = args.config;
    this.meta = args.meta;
    this._manifest = new FizmooManifest({
      outFilePath: path.resolve(this.dirs.binDir, "./fizmoo.manifest.json"),
    });
  }

  /**
   * Creates some new constants based upon the resolved configuration
   */
  protected get dirs() {
    const commandsDirName = this.config.commandsDir ?? "commands";
    const binDir = path.resolve(this.meta.dirPath, "../bin");
    const rootDir = path.resolve(this.meta.dirPath, "../");
    const dirs: FizmooDirs = {
      commandsDir: path.resolve(this.meta.dirPath, `./${commandsDirName}`),
      packageJsonPath: path.resolve(rootDir, "./package.json"),
      binDir,
      outDir: path.resolve(binDir, "./commands"),
    };
    return dirs;
  }

  /**
   * An array of string paths that are used as globs to resolve
   * the possible entry points of the command.
   *
   * We dynamically create our entry points up to 20 glob paths
   * If someone is creating more than 20 nested glob paths for their
   * command files then I feel like there are more serious problems
   * than being able to load them... :/
   *
   * The reason we try to evaluate on globs is that if we find that
   * a file is invalid or we want to add another file after the load
   * process starts, we can do that, esbuild will handle it, and then
   * we can create the manifest after we know all of the commands
   * are well formed
   */
  protected get entryPoints() {
    const entryPointGlob = [...new Array(20)]
      .map((_, i) => {
        const numOfStars = i + 1;
        const levels = [...new Array(numOfStars)].map(() => "*").join(".");
        return `${this.dirs.commandsDir}/${levels}.ts`;
      })
      .concat(this.dirs.commandsDir.concat("/**/command.ts"));
    return entryPointGlob;
  }

  /**
   * Returns the commands manifest
   */
  get manifest() {
    return this._manifest.manifest;
  }

  /**
   * Provided the path of the file, this method is designed to read a file
   * and determine if it should be parsed as a Fizmoo command. If it is
   * does pass the tests, then it should be parsed and stored in the manifest.
   *
   * This function will evaluate a loaded file against the entry points glob
   * to ensure that the file that is loaded by esbuild is actually a command.
   * We still want esbuild to build all of the files, but we only want to process
   * a specific subset of those as commands to create the commands manifest.
   *
   * This is necessary due to the fact that esbuild will build any files that are imported
   * into the command. We want esbuild to build them but we don't want to process those
   * imports as commands.
   */
  protected async processFile(filePath: string) {
    // ignore anything that isn't in the commands dir
    LOG.debug(`Processing file... ${filePath}`);
    const isMatch = picomatch(this.entryPoints);
    const filename = path.parse(filePath).name;
    const isCommandFile = isMatch(filePath) && !filename.startsWith("_");
    if (!isCommandFile) {
      LOG.debug(`Command file: ❌. Ignoring...`);
      return;
    }
    LOG.debug(`Command file: ✅. Parsing... `);
    await this.parseAndStoreCommand(filePath);
  }

  private async parseAndStoreCommand(filePath: string) {
    LOG.debug(`Parsing command...`);
    const cmdRelPath = this.getCmdRelPath(filePath);
    const cmdId = this.getCmdId(cmdRelPath);
    const cmdSegments = cmdId.split(".");
    const cmdParent = this.getCmdParent(cmdSegments);
    const cmdModule = await this.importCmd(filePath);
    const cmdOutPath = this.getCmdOutPath(cmdRelPath);
    const cmdMeta = this.getCommandMeta(cmdModule, filePath);
    const cmdHasAction = typeof cmdModule.action !== "undefined";
    LOG.debug(`Parsing command... done.`);

    const manifestEntry: ManifestEntry = {
      id: cmdId,
      name: cmdMeta.name,
      description: cmdMeta.description,
      options: {
        ...defaultOptions,
        ...cmdModule.options,
      },
      args: cmdModule.args ?? undefined,
      segments: cmdSegments,
      outPath: cmdOutPath,
      parentCommand: cmdParent,
      help: "",
      hasAction: cmdHasAction,
      level: cmdSegments.length,
      hasRequiredArgs: Object.values(cmdModule.args ?? {}).reduce(
        (accum, arg) => {
          if (arg.required) return true;
          return accum;
        },
        false
      ),
    };

    LOG.debug(`Adding "${cmdId}" to manifest...`);
    this.manifest.set(cmdId, manifestEntry);
    LOG.trace("Record", this.manifest.get(cmdId));
    LOG.debug(`Adding "${cmdId}" to manifest... done.`);
  }

  /**
   * Normalizes the commandPath relative to the
   * commands directory. This allows each command to have a specific
   * ID based upon it's normalized path.
   */
  private getCmdId(cmdRelPath: string) {
    // normalize the command id
    let cmdId = cmdRelPath.replace(/\/command.ts/, "");
    cmdId = this.replaceExt(cmdId, "");
    return cmdId;
  }

  private getCmdParent(cmdSegments: string[]) {
    let segments = cmdSegments;
    segments.pop();
    const parentId = segments.join(".");
    return parentId || null;
  }

  private getCmdRelPath(filePath: string) {
    return path.relative(this.dirs.commandsDir, filePath);
  }

  private getCmdOutPath(cmdRelPath: string) {
    return this.replaceExt(path.join("./commands", cmdRelPath), ".js");
  }

  private getCommandMeta(cmdModule: Command, cmdPath: string) {
    // validate that meta
    if (!cmdModule.meta) {
      throw `"${cmdPath}" does not have a "meta" export. This is a required value. Please export constant "meta" with "name" and "description" as key/values.`;
    }
    if (!cmdModule.meta?.name) {
      throw `"${cmdPath}" does not have a "meta.name" export. This is a required value.`;
    }
    if (!cmdModule.meta?.description) {
      throw `"${cmdPath}" does not have a "meta.description" export. This is a required value.`;
    }
    return cmdModule.meta;
  }

  // private getCommandParents(cmdSegments: string[]) {
  //   const result = [];
  //   let prefix = "";

  //   for (let i = 0; i < cmdSegments.length - 1; i++) {
  //     // Stop before the last element
  //     prefix = prefix ? `${prefix}.${cmdSegments[i]}` : cmdSegments[i];
  //     result.push(prefix);
  //   }

  //   return result;
  // }

  private async importCmd(cmdPath: string) {
    async function importModule() {
      try {
        const cmdModule = (await import(cmdPath)) as Command;
        return cmdModule;
      } catch (error) {
        // LOG.error(`Error when trying to import the command module at ${cmdPath}`);
        throw new Error(String(error));
      }
    }

    const res = await tryHandle(importModule)();
    if (res.hasError) {
      throw new Error(
        `Error when attempting to import the command during parsing: ${res.error.message}`
      );
    }
    return res.data;
  }

  private replaceExt(path: string, replacement: string) {
    return path.replace(/\.(ts|js|mjs)$/, replacement);
  }
}
