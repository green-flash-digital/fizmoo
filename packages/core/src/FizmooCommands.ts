import { DotDirResponse } from "dotdir";
import path from "node:path";
import picomatch from "picomatch";
import { tryHandle } from "ts-jolt/isomorphic";
import { Command } from "./_fizmoo.types.js";
import {
  FizmooManifestEntry,
  FizmooManifestEntryData,
  LOG,
} from "./_fizmoo.utils.js";
import { FizmooConfig } from "./_fizmoo.config.js";
import { writeFile } from "node:fs/promises";
import { printAsBullets } from "isoscribe";

type FizmooDirs = {
  commandsDir: string;
  packageJsonPath: string;
  binDir: string;
  outDir: string;
};

export class FizmooCommands {
  manifest: Map<string, FizmooManifestEntry>;
  protected config: DotDirResponse<FizmooConfig>["config"];
  protected meta: Omit<DotDirResponse<FizmooConfig>, "config">["meta"];
  private _errorReport: {
    MISSING_COMMANDS: Set<string>;
  };
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
  entryPoints: string[];

  constructor(args: DotDirResponse<FizmooConfig>) {
    this.config = args.config;
    this.meta = args.meta;
    this.manifest = new Map();
    this._errorReport = { MISSING_COMMANDS: new Set() };
    this.entryPoints = [...new Array(20)]
      .map((_, i) => {
        const numOfStars = i + 1;
        const levels = [...new Array(numOfStars)].map(() => "*").join(".");
        return `${this.dirs.commandsDir}/${levels}.ts`;
      })
      .concat(this.dirs.commandsDir.concat("/**/command.ts"));
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
  async processFile(filePath: string) {
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
    await this.addCommandToManifest(filePath);
  }

  private async addCommandToManifest(filePath: string) {
    const commandRelPath = this.getCommandRelPath(filePath);
    const commandId = this.getCommandId(commandRelPath);
    const commandParents = this.getCommandParents(commandId);
    const commandOutFile = this.getCommandOutFile(commandRelPath);
    const commandData = await this.getCommandData(filePath);

    LOG.debug(`Adding "${commandId}" to manifest...`);
    this.manifest.set(commandId, {
      file: commandOutFile,
      parents: commandParents,
      data: commandData,
    });
    LOG.trace("Record", this.manifest.get(commandId));
    LOG.debug(`Adding "${commandId}" to manifest... done.`);
  }

  private getCommandRelPath(filePath: string) {
    return path.relative(this.dirs.commandsDir, filePath);
  }

  private getCommandId(commandRelativePath: string) {
    let commandId = commandRelativePath.replace(/\/command.ts/, "");
    return this.replaceExt(commandId, "");
  }

  private getCmdSegments(commandId: string) {
    return commandId.split(".");
  }

  private getCommandParents(cmdId: string) {
    const segments = this.getCmdSegments(cmdId);

    const result = [];
    let prefix = "";

    for (let i = 0; i < segments.length - 1; i++) {
      // Stop before the last element
      prefix = prefix ? `${prefix}.${segments[i]}` : segments[i];
      result.push(prefix);
    }

    if (result.length === 0) return null;
    return result;
  }

  private getCommandOutFile(filePath: string) {
    return this.replaceExt(path.join("./commands", filePath), ".js");
  }

  private async importCommandModule(commandPath: string) {
    async function importModule() {
      try {
        const cmdModule = (await import(
          `${commandPath}?q=${new Date().toISOString()}`
        )) as Command;
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

  private async getCommandData(
    filePath: string
  ): Promise<FizmooManifestEntryData> {
    const module = await this.importCommandModule(filePath);

    if (!module.meta) {
      throw `"${filePath}" does not have a "meta" export. This is a required value. Please export constant "meta" with "name" and "description" as key/values.`;
    }
    if (!module.meta?.name) {
      throw `"${filePath}" does not have a "meta.name" export. This is a required value.`;
    }
    if (!module.meta?.description) {
      throw `"${filePath}" does not have a "meta.description" export. This is a required value.`;
    }

    return {
      name: module.meta.name,
      description: module.meta.description,
      args: module.args,
      options: {
        help: {
          type: "boolean",
          required: false,
          alias: "h",
          description: "Display the help menu",
        },
        ...module.options,
      },
      help: "",
    };
  }

  private replaceExt(path: string, replacement: string) {
    return path.replace(/\.(ts|js|mjs)$/, replacement);
  }

  /**
   * Writes the manifest file to the bin directory
   */
  private async writeManifestToDisk() {
    const manifestPath = path.resolve(this.dirs.binDir, "fizmoo.manifest.json");
    const manifestContent = JSON.stringify(
      Object.fromEntries(this.manifest.entries()),
      null,
      2
    );
    const res = await tryHandle(writeFile)(manifestPath, manifestContent);
    if (res.hasError) throw LOG.fatal(res.error);
  }

  /**
   * Validates each entry in the manifest to ensure it's well formed
   */
  async validateManifest() {
    LOG.checkpointStart("Manifest:validate");

    await this.writeManifestToDisk();

    for (const [entryId, entry] of this.manifest.entries()) {
      LOG.checkpointStart(`Validating "${entryId}"`);
      // The command doesn't have any parents so we don't
      // have to validate it's parent's since well... it doesn't
      // have any so boom.
      if (!entry.parents) return;

      // Loop through the parent commands to determine if any of
      // them are missing
      for (const parentId of entry.parents) {
        const parentCommand = this.manifest.get(parentId);
        if (!parentCommand) this._errorReport.MISSING_COMMANDS.add(parentId);
      }
      LOG.checkpointEnd();
    }

    if (this._errorReport.MISSING_COMMANDS.size > 0) {
      throw LOG.fatal(
        new Error(`There was an error when validating the generated fizmoo manifest.

Missing Files:
You created a sub-command in your file system but you are missing a parent command
${printAsBullets([...this._errorReport.MISSING_COMMANDS.values()])}
        `)
      );
    }

    LOG.checkpointEnd();

    // after validation write the manifest
    await this.writeManifestToDisk();
  }
}
