import { DotDirResponse } from "dotdir";
import path from "node:path";
import picomatch from "picomatch";
import { tryHandle } from "ts-jolt/isomorphic";
import { Command, Options } from "./_fizmoo.types.js";
import { FizmooManifest, ManifestEntry } from "./FizmooManifest.js";
import { printAsBullets } from "isoscribe";
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
    this._manifest = new FizmooManifest();
    this.config = args.config;
    this.meta = args.meta;
  }

  /**
   * Creates some new constants based upon the resolved configuration
   */
  protected get dirs() {
    const commandsDirName = this.config.commandsDir ?? "commands";
    const binDir = path.resolve(this.meta.dirPath, "./bin");
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
    LOG.debug("Loading command...");
    const isMatch = picomatch(this.entryPoints);
    const filename = path.parse(filePath).name;
    const isCommandFile = isMatch(filePath) && !filename.startsWith("_");
    if (!isCommandFile) {
      LOG.debug(`Loading command... INVALID_COMMAND. Ignoring: "${filePath}"`);
      return;
    }
    LOG.debug(
      `Loading command... VALID_COMMAND. Parsing command at path: ${filePath}...`
    );
    await this.parseAndStoreCommand(filePath);
  }

  private async parseAndStoreCommand(filePath: string) {
    LOG.debug("Processing command file", filePath);
    const cmdRelPath = this.getCommandRelPath(filePath);
    const cmdId = this.getCommandId(cmdRelPath);
    const cmdSegments = this.getCommandSegments(cmdId, filePath);
    const cmdModule = await this.getFizmooCommand(filePath);
    const cmdModulePath = this.getFizmooCommandPath(cmdRelPath);
    const cmdMeta = this.getCommandMeta(cmdModule, filePath);
    const cmdParents = this.getCommandParents(cmdSegments);

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
      path: cmdModulePath,
      help: "",
      subCommands: [],
      meta: {
        parentCommands: cmdParents,
        hasAction: typeof cmdModule.action !== "undefined",
        level: cmdSegments.length,
        hasRequiredArgs: Object.values(cmdModule.args ?? {}).reduce(
          (accum, arg) => {
            if (arg.required) return true;
            return accum;
          },
          false
        ),
      },
    };

    LOG.debug("Adding command to manifest", filePath);
    this.manifest.set(cmdId, manifestEntry);
    LOG.trace(
      "Manifest entries",
      JSON.stringify(Object.fromEntries(this.manifest.entries()), null, 2)
    );
  }

  /**
   * Normalizes the commandPath relative to the
   * commands directory. This allows each command to have a specific
   * ID based upon it's normalized path.
   */
  private getCommandId(cmdRelPath: string) {
    // normalize the command id
    let cmdId = cmdRelPath.replace(/\/command.ts/, "");
    cmdId = this.replaceExt(cmdId, "");
    return cmdId;
  }

  private getCommandRelPath(filePath: string) {
    return path.relative(this.dirs.commandsDir, filePath);
  }

  private getFizmooCommandPath(cmdRelPath: string) {
    return this.replaceExt(path.join("./commands", cmdRelPath), ".js");
  }

  private getCommandSegments(cmdId: string, cmdPath: string) {
    try {
      const cmdSegments = cmdId.split(".");
      return cmdSegments;
    } catch {
      throw `"${cmdPath}" is malformed. Command files should either be follow the below conventions:
      ${printAsBullets([
        ".buttery/commands/<sub-command>.<sub-command>.<...sub-command>/command.ts",
        ".buttery/<sub-command>.ts",
      ])}`;
    }
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

  private getCommandParents(cmdSegments: string[]) {
    const result = [];
    let prefix = "";

    for (let i = 0; i < cmdSegments.length - 1; i++) {
      // Stop before the last element
      prefix = prefix ? `${prefix}.${cmdSegments[i]}` : cmdSegments[i];
      result.push(prefix);
    }

    return result;
  }

  private async getFizmooCommand(cmdPath: string) {
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
