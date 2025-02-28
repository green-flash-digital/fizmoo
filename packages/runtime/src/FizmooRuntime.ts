import {
  fizmooConstants,
  type FizmooManifest,
  type FizmooManifestEntry,
} from "@fizmoo/core";
import { tryHandleSync } from "ts-jolt/isomorphic";

type RuntimeOption =
  | {
      type: "expanded";
      value: string | undefined;
      raw: string;
    }
  | { type: "alias"; value: string | undefined; raw: string };
type RuntimeOptionsMap = Map<string, RuntimeOption>;
type RuntimeArgsSet = Set<string>;

export class FizmooRuntime {
  _manifest: Map<string, FizmooManifestEntry>;

  constructor(manifest: FizmooManifest) {
    this._manifest = new Map(Object.entries(manifest));
    this._parseExpression = this._parseExpression.bind(this);
  }

  /**
   * Parses the options from the expression into a workable format
   * that can be used to then compare against the command option definition
   */
  private _parseRuntimeOptions(rawOptions: string[]): RuntimeOptionsMap {
    const parsedExpressionOptions = new Map<string, RuntimeOption>();

    for (const rawOption of rawOptions) {
      const [optionKey, optionValue] = rawOption.split("=");

      // Handle an expanded alias
      if (optionKey.startsWith("--")) {
        const optionId = optionKey.replace("--", "");
        parsedExpressionOptions.set(optionId, {
          type: "expanded",
          value: optionValue,
          raw: rawOption,
        });
        continue;
      }

      // Handle an alias option
      if (optionKey.startsWith("-")) {
        const optionId = optionKey.replace("-", "");
        parsedExpressionOptions.set(optionId, {
          type: "alias",
          value: optionValue,
          raw: rawOption,
        });
        continue;
      }

      throw `"${rawOption}" has been parsed as an option and is malformed. Use an alias prefixed with a "-" or a expanded option prefixed with a "--".`;
    }

    return parsedExpressionOptions;
  }

  /**
   * Parses the args fro the expression into a workable format
   * that can be used to then compare against the command args definition
   */
  private _parseRuntimeArgs(rawArgs: string[]): RuntimeArgsSet {
    return new Set([...rawArgs]);
  }

  /**
   * Parses the arguments on the process.argv to create some structured
   * data that can then be used to validate the options and the args
   * to ensure they match that runtime options that have been provided.
   */
  private _parseExpression() {
    const commandParts = process.argv.slice(2); // Ignore CLI name
    let commandPath: string[] = [];
    let remainingArgs = [...commandParts];
    let commandId = "";

    while (remainingArgs.length > 0) {
      let possibleCommand = commandPath.length
        ? `${commandPath.join(".")}.${remainingArgs[0]}`
        : remainingArgs[0];

      if (this._manifest.get(possibleCommand)) {
        commandId = possibleCommand;
        commandPath.push(remainingArgs.shift()!);
      } else {
        break; // Stop when no more commands match
      }
    }

    const argsRaw = remainingArgs.filter((arg) => !arg.startsWith("--"));
    const optionsRaw = remainingArgs.filter(
      (arg) => arg.startsWith("--") || arg.startsWith("-")
    );

    if (commandId === "" && argsRaw.length > 0) {
      throw `Unknown command "${argsRaw[0]}"`;
    }

    if (commandId === "") {
      commandId = fizmooConstants.COMMAND_ROOT;
    }

    // Parse the options into a workable format
    const options = this._parseRuntimeOptions(optionsRaw);
    const args = this._parseRuntimeArgs(argsRaw);

    return {
      commandId,
      args,
      options,
    };
  }

  // private _getOptions(
  //   commandDef: FizmooManifestEntry,
  //   options: ReturnType<typeof this._parseRuntimeOptions>
  // ): void {
  //   // Loop through all of the runtime options and try to reconcile a
  //   for (const runtimeOption of runtimeOptions) {
  //     const optionMeta = this._parseOption(runtimeOption);

  //     // Throw if the runtime option doesn't follow a specific format
  //     if (optionMeta.type === "malformed") {
  //     }

  //     // Throw if the runtime option doesn't exist

  //     if (optionMeta.type === "expanded") {
  //       const expandedOption = optionsDef[optionMeta.value];
  //       if (!expandedOption) {
  //         throw `"${optionMeta.raw}" is not a valid option.`;
  //       }
  //       return expandedOption;
  //     }

  //     // Throw if the runtime option alias doesn't exist
  //     if (optionMeta.type === "alias") {
  //       const aliasOption = Object.values(optionsDef).reduce<
  //         Option | undefined
  //       >((accum, option) => {
  //         if (option.alias === optionMeta.value) {
  //           return option;
  //         }
  //         return accum;
  //       }, undefined);
  //       if (!aliasOption) {
  //         throw `"${optionMeta.raw}" is not a valid alias.`;
  //       }
  //       return aliasOption;
  //     }
  //   }
  // }

  public execute() {
    // Get the runtime command
    const commandRes = tryHandleSync(this._parseExpression)();
    if (commandRes.hasError) {
      return this.throw(commandRes.error);
    }

    const { commandId, args, options } = commandRes.data;
    const commandDef = this._manifest.get(commandRes.data.commandId);
    if (!commandDef) {
      return this.throw(`Unknown Command "${commandId}"`);
    }

    // Check to see if we should just print the menu
    const shouldPrintMenu =
      (options.size === 0 || options.has("help")) && args.size === 0;
    if (shouldPrintMenu) return console.log(commandDef.data.help);

    // TODO: Validate options
    const optionRes = tryHandleSync(this._getOptions)(commandDef, options);
    if (optionRes.hasError) {
      return this.throw(optionRes.error);
    }

    // TODO: Validate args
    const argsRes = tryHandleSync(this._getArgs)(commandDef, options);
    if (argsRes.hasError) {
      return this.throw(argsRes.error);
    }

    // TODO: Import the file and then run the action
  }

  throw(error: any) {
    console.error(`\x1b[91m${String(error)}\x1b[0m`);
  }
}
