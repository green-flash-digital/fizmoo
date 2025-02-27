import { DotDirResponse } from "dotdir";
import path from "node:path";
import picomatch from "picomatch";
import { exhaustiveMatchGuard, tryHandle } from "ts-jolt/isomorphic";
import {
  Command,
  FizmooManifestEntry,
  FizmooManifestEntryData,
} from "./_fizmoo.types.js";
import { LOG } from "./_fizmoo.utils.js";
import { FizmooConfig } from "./_fizmoo.config.js";
import { writeFile } from "node:fs/promises";
import { printAsBullets } from "isoscribe";
import pc from "picocolors";

export class FizmooCommands {
  manifest: Map<string, FizmooManifestEntry>;
  protected config: DotDirResponse<FizmooConfig>["config"];
  protected meta: Omit<DotDirResponse<FizmooConfig>, "config">["meta"];
  private _errorReport: {
    MISSING_COMMANDS: Set<string>;
    MALFORMED_COMMAND: Map<string, string>;
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
    this._errorReport = {
      MISSING_COMMANDS: new Set(),
      MALFORMED_COMMAND: new Map(),
    };
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
    const dirs = {
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
      src: path.relative(import.meta.dirname, filePath),
      file: commandOutFile,
      parents: commandParents,
      subCommands: null, // this will be enriched after the full manifest is built
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
    return this.replaceExt("./commands/".concat(filePath), ".js");
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

    return {
      name: module.meta?.name ?? "",
      description: module.meta?.description ?? "",
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
      hasAction: !!module.action,
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
  private validateManifest() {
    LOG.checkpointStart("Manifest:validate");
    const allCommandIds = [...this.manifest.keys()];

    for (const [commandId, command] of this.manifest.entries()) {
      LOG.debug(`Validating "${commandId}"...`);
      // Validate parents
      if (command.parents) {
        for (const parentId of command.parents) {
          const parentCommand = this.manifest.get(parentId);
          if (!parentCommand) this._errorReport.MISSING_COMMANDS.add(parentId);
        }
      }

      // Validate Meta
      if (!command.data.name) {
        this._errorReport.MALFORMED_COMMAND.set(
          commandId,
          "Missing a `meta.name`."
        );
      }
      if (!command.data.description) {
        this._errorReport.MALFORMED_COMMAND.set(
          commandId,
          "Missing a `meta.description`."
        );
      }

      // Validate Action
      const hasSubCommands = allCommandIds.reduce((accum, cmdId) => {
        // If one of the commands in the manifest starts with this
        // command ID and it's not an exact match, then we can infer
        // that it has sub commands.
        if (cmdId !== commandId && cmdId.startsWith(commandId)) {
          return true;
        }
        return accum;
      }, false);
      const hasAction = !command.data.hasAction;
      console.log({ hasSubCommands, hasAction });
      if (hasSubCommands && !hasAction) {
        this._errorReport.MALFORMED_COMMAND.set(
          commandId,
          "This an `action`. Please export an action from this file."
        );
      }

      LOG.debug(`Validating "${commandId}"... done.`);
    }

    this.printErrorReport();

    LOG.checkpointEnd();
  }

  private printErrorReport() {
    const hasMissingFiles = this._errorReport.MISSING_COMMANDS.size > 0;
    const hasInvalidCommands = this._errorReport.MALFORMED_COMMAND.size > 0;
    let report = "";

    if (!hasMissingFiles && !hasInvalidCommands) return;

    if (this._errorReport.MISSING_COMMANDS.size > 0) {
      report = report.concat(`
${pc.underline("Missing Files:")}
You created a sub-command in your file system but you are missing a parent command
${printAsBullets([...this._errorReport.MISSING_COMMANDS.values()])}
`);
    }

    if (this._errorReport.MALFORMED_COMMAND.size > 0) {
      report = report.concat(`
${pc.underline("Invalid Commands:")}
TBD  
`);
    }

    if (!report) return;
    throw LOG.fatal(
      new Error(`There was an error when validating the generated fizmoo manifest.
${report}
`)
    );
  }

  private formatHelpCommandTitle(title: string) {
    return pc.bold(pc.underline(title));
  }

  /**
   *
   * Adds the usage section (how to use and call the) CLI command
   * onto the help men. By default, all required args and options
   * will be displayed via their properties
   * all other optional args wil be displayed with args or --options
   *
   * KEY
   * <> = required
   * [] = optional
   */
  private setHelpCommandUsage(
    commandId: string,
    { subCommands, data: { args, options } }: FizmooManifestEntry,
    helpMenu: string[]
  ) {
    helpMenu.push(this.formatHelpCommandTitle("Usage:"));

    const expression = `${this.config.name} ${commandId.replace(".", " ")}`;
    const optionEntires = Object.entries(options ?? {});
    const argEntries = Object.entries(args ?? {});
    const argVals = argEntries.reduce(
      (accum, [argName, argValue]) => {
        if (argValue.required) {
          return Object.assign(accum, {
            required: accum.required.concat(` <${argName}>`),
          });
        }
        return accum;
      },
      { required: "", optional: " [args]" }
    );
    const subCommandStr = (subCommands ?? []).length > 0 ? " <subcommand>" : ""; // if sub commands exist they're always marked as required
    const argStr =
      argEntries.length === 0 ? "" : `${argVals.required}${argVals.optional}`;
    const optStr = optionEntires.length === 0 ? "" : " [--options]";

    helpMenu.push(`  ${expression}${subCommandStr}${argStr}${optStr}`);
    helpMenu.push("");
  }

  /**
   * Adds the command description to the help menu
   */
  private setHelpCommandDescription(
    { data: { description } }: FizmooManifestEntry,
    helpMenu: string[]
  ) {
    helpMenu.push(this.formatHelpCommandTitle("Description:"));
    helpMenu.push(`  ${description}`);
    helpMenu.push("");
  }

  /**
   * Pushes the subCommand entires into the sub commands
   * section of the help menu. The max length of all of
   * the sub command names is found so all of the sub command
   * descriptions start at the same column in the help menu
   */
  private setHelpCommandSubCommands(
    { subCommands }: FizmooManifestEntry,
    helpMenu: string[]
  ) {
    const subCmdsIds = subCommands ?? [];
    if (subCmdsIds.length === 0) return;

    helpMenu.push(this.formatHelpCommandTitle("Sub-commands:"));

    // Get the max length of the names
    const subCmdNameMaxLength = subCmdsIds.reduce<number>((accum, subCmdId) => {
      const length = (this.manifest.get(subCmdId)?.data.name ?? "").length;
      if (length > accum) return length;
      return accum;
    }, 0);

    // Add the sub command name and description to the menu
    for (const subCommandId of subCmdsIds) {
      const subCommandEntry = this.manifest.get(subCommandId);
      if (!subCommandEntry) continue;
      const { name, description } = subCommandEntry.data;
      helpMenu.push(`  ${name.padEnd(subCmdNameMaxLength)}  ${description}`);
    }

    helpMenu.push("");
  }

  /**
   * Runs through all of the provided args from the command file
   * determines some values based upon those args and pushes
   * those formatted values onto the help menu
   */
  private setHelpCommandArgs(
    { data: { args } }: FizmooManifestEntry,
    helpMenu: string[]
  ) {
    const argEntries = Object.entries(args ?? {});
    if (argEntries.length === 0) return;

    helpMenu.push(this.formatHelpCommandTitle("Arguments:"));

    // Get the max length of the arg names to correctly indent
    const argNameMaxLength = argEntries.reduce<number>((accum, [argName]) => {
      if (argName.length > accum) return argName.length;
      return accum;
    }, 0);

    // Loop through all of the args and assemble the strings to create
    // the arg description for the menu
    for (const [argName, arg] of argEntries) {
      let choices = "";
      let validations = "";

      switch (arg.type) {
        case "string": {
          if (arg.choices) {
            choices = `choices: [${arg.choices.join(", ")}]`;
          }
          if (arg.length) {
            const length = Object.entries(arg.length).reduce<string[]>(
              (accum, [valName, valValue]) => {
                return accum.concat(`${valName}: ${valValue}`);
              },
              []
            );
            validations = validations.concat(`length: [${length.join(", ")}]`);
          }
          break;
        }

        case "number": {
          if (arg.choices) {
            choices = `choices: [${arg.choices.join(", ")}]`;
          }
          if (arg.range) {
            const range = Object.entries(arg.range).reduce<string[]>(
              (accum, [valName, valValue]) => {
                return accum.concat(`${valName}: ${valValue}`);
              },
              []
            );
            validations = validations.concat(`range: [${range.join(", ")}]`);
          }
          break;
        }

        case "boolean":
          break;

        default:
          exhaustiveMatchGuard(arg);
      }

      // Assemble some values
      const type = arg.required ? `<${arg.type}>` : `[${arg.type}]`;
      const requirement = arg.required ? "required" : "optional";
      const defaulted = arg.default ? `default: ${arg.default}` : "";
      const descRoot = `${arg.description} ${type}`;
      const descVals = [requirement, choices, validations, defaulted]
        .filter(Boolean)
        .join(", ");
      const description = `${descRoot} ${pc.dim(`(${descVals})`)}`;

      helpMenu.push(`  ${argName.padEnd(argNameMaxLength)}  ${description}`);
    }
    helpMenu.push("");
  }

  /**
   * Runs through all of the provided options from the command file
   * determines some values based upon those options and pushes
   * those formatted values onto the help menu
   */
  private setHelpCommandOptions(
    { data: { options } }: FizmooManifestEntry,
    helpMenu: string[]
  ) {
    const optEntries = Object.entries(options ?? {});
    if (optEntries.length === 0) return;

    helpMenu.push(this.formatHelpCommandTitle("Options:"));

    // Get the max length of the option names to correctly indent
    const maxNameLength = optEntries.reduce<number>((accum, [optName]) => {
      if (optName.length > accum) return optName.length;
      return accum;
    }, 0);

    // Loop through all of the entires and assemble the name and
    // description values for the menu
    for (const [optName, option] of optEntries) {
      // create the optionName
      const name = `--${optName}`;
      const alias = option.alias ? `, -${option.alias}` : " ";
      const type = option.required ? `<${option.type}>` : `[${option.type}]`;
      const optionName = `${name}${alias}`;

      // create the optionDesc
      const defaultVal = option.default ? `(default: ${option.default})` : null;
      const requirement = option.required ? "required" : "optional";
      const descriptionProps = pc.dim(
        `(${[requirement, defaultVal].filter(Boolean).join(", ")})`
      );
      const optionDesc = `${option.description} ${type} ${descriptionProps}`;

      // Push to the menu
      helpMenu.push(`  ${optionName.padEnd(maxNameLength)}  ${optionDesc}`);
    }
    helpMenu.push("");
  }

  /**
   * Loops through all of the valid entries of the manifest and
   * adds more context to some of the static commands
   */
  private enrichManifest() {
    LOG.checkpointStart("Enriching manifest");
    const allCommandIds = [...this.manifest.keys()];

    for (const [commandId, commandEntry] of this.manifest.entries()) {
      LOG.debug(`"${commandId}" - Finding sub-commands...`);
      // Enrich the entry.subCommands
      const commandLevel = this.getCmdSegments(commandId).length;
      const subCommands = allCommandIds.filter((cmdId) => {
        const cmdLevel = this.getCmdSegments(cmdId).length;
        const isSubCommand =
          cmdId.startsWith(commandId) && commandLevel + 1 === cmdLevel;
        return isSubCommand;
      });
      // we do this before we set the menu since the the menu
      // methods need the subCommands value in order to properly calculate
      // and format the menu methods
      this.manifest.set(commandId, { ...commandEntry, subCommands });
      LOG.debug(`"${commandId}" - Finding sub-commands... done`);

      // Enrich the entry.menu
      LOG.debug(`"${commandId}" - Building help menu...`);
      const helpMenu: string[] = [];
      this.setHelpCommandUsage(commandId, commandEntry, helpMenu);
      this.setHelpCommandDescription(commandEntry, helpMenu);
      this.setHelpCommandSubCommands(commandEntry, helpMenu);
      this.setHelpCommandArgs(commandEntry, helpMenu);
      this.setHelpCommandOptions(commandEntry, helpMenu);
      const help = helpMenu.join("\n");
      this.manifest.set(commandId, {
        ...commandEntry,
        data: { ...commandEntry.data, help },
      });
      LOG.debug(`"${commandId}" - Building help menu... done`);
    }
    LOG.checkpointEnd();
  }

  /**
   * Builds the manifest and then writes it to disk. It enriches
   * a few fo the data options
   */
  async buildManifest() {
    this.validateManifest();
    this.enrichManifest();
    await this.writeManifestToDisk();
  }
}
