import {
  fizmooConstants,
  type FizmooManifest,
  type FizmooManifestEntry,
  type Option,
} from "@fizmoo/core";
import path from "node:path";
import { exhaustiveMatchGuard, tryHandleSync } from "ts-jolt/isomorphic";

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
  private _commandOptions: Map<string, string | number | boolean>;
  private _commandArgs: Map<any, string | number | boolean>;
  private _cwd: string;

  constructor(manifest: FizmooManifest, options?: { cwd?: string }) {
    this._manifest = new Map(Object.entries(manifest));
    (this._cwd = options?.cwd ?? import.meta.dirname),
      (this._commandOptions = new Map());
    this._commandArgs = new Map();
    this._parseExpression = this._parseExpression.bind(this);
    this._validateAndSetCommandOptions =
      this._validateAndSetCommandOptions.bind(this);
    this._validateAndSetCommandArgs =
      this._validateAndSetCommandArgs.bind(this);
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
   * TODO: Parse out the equals sign
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

  /**
   * Provided the command definition from the command file as well as the
   * options that were gathered and parsed from the process.argV, this method
   * will run through all of the runtime options and validate them. If they're
   * valid against the option definitions, this method will add them to the options
   * are passed to the action
   */
  private _validateAndSetCommandOptions(
    commandDef: FizmooManifestEntry,
    rOptions: RuntimeOptionsMap
  ): void {
    const optionsDef = commandDef.data.options ?? {};

    // Loop through all of the runtime options to validate & parse
    for (const [rOptionId, rOption] of rOptions) {
      let optionDef: Option | undefined = undefined;

      // Get the option definition. If the option that was provided at runtime
      // doesn't match an option in the options definition or the alias
      // provided at runtime isn't an alias defined in one of the options
      // we throw an error
      switch (rOption.type) {
        case "expanded":
          optionDef = optionsDef[rOptionId];
          if (!optionDef) {
            throw `"${rOptionId}" is not a valid option.`;
          }
          break;

        case "alias":
          optionDef = Object.values(optionsDef).reduce<Option | undefined>(
            (accum, option) => {
              if (option.alias === rOption.value) {
                return option;
              }
              return accum;
            },
            undefined
          );
          if (!optionDef) {
            throw `"${rOptionId}" is not a valid alias to an option.`;
          }
          break;

        default:
          exhaustiveMatchGuard(rOption);
      }

      // Process the runtime option against the option definition
      // if it fails general validation it will throw with message
      switch (optionDef.type) {
        case "boolean": {
          let value = undefined;
          if (rOption.value === "true") value = true;
          if (rOption.value === "false") value = false;
          if (typeof rOption.value === "undefined") {
            // option is listed but has no value next to it
            value = optionDef.default ?? true;
          }

          // Value hasn't been reconciled from a default or logic yet so it's technically invalid
          if (typeof value !== "boolean") {
            throw `Invalid value "${rOption.value}" for boolean option "${rOptionId}". Possible values include:
  --${rOptionId}=true
  --${rOptionId}=false
  --${rOptionId} (absence of value: true || default set in command)`;
          }

          this._commandOptions.set(rOptionId, value);
          break;
        }

        case "string": {
          const value = rOption.value
            ? String(rOption.value)
            : optionDef.default;

          // Check for a type of string
          if (typeof value !== "string") {
            throw `Option "${rOptionId}" must have a string value`;
          }

          this._commandOptions.set(rOptionId, value);
          break;
        }

        case "number": {
          const value = rOption.value
            ? Number(rOption.value)
            : optionDef.default;

          // check for a number
          if (Number.isNaN(value)) {
            throw `Option "${rOptionId}" must be a parsable number.`;
          }

          // Check for a value
          if (typeof value === "undefined") {
            throw `Expected "${rOptionId}" to have a value.`;
          }
          this._commandOptions.set(rOptionId, value);
          break;
        }

        default:
          exhaustiveMatchGuard(optionDef);
      }
    }

    // Validate that all of the required options have been correctly
    // parsed and added to the _commandOptions
    for (const [optionId, optionDef] of Object.entries(optionsDef)) {
      if (optionDef.required && !this._commandOptions.has(optionId)) {
        throw `Missing required option "${optionId}"`;
      }
    }
  }

  /**
   * Provided the command definition from the command file as well as the
   * args that were gathered and parsed from the `process.argv`, this method
   * will run through all of the runtime args and validate them. If they're
   * valid against the option definitions, this method will add them to the args
   * are passed to the action
   */
  private _validateAndSetCommandArgs(
    commandDef: FizmooManifestEntry,
    runtimeArgs: RuntimeArgsSet
  ) {
    const argsDef = commandDef.data.args ?? {};

    // Loop through all of the runtime args to validate & parse
    for (const runtimeArgValue of runtimeArgs) {
      const argDef = argsDef[runtimeArgValue];

      // Validate that the runtime arg is expected to be there
      if (!argDef) {
        throw new Error(`Unexpected positional argument: "${runtimeArgValue}"`);
      }

      // Process the runtime option against the option definition
      // if it fails general validation it will throw with message
      switch (argDef.type) {
        case "boolean":
          // Handle boolean arguments
          const value =
            runtimeArgValue?.toLowerCase() === "true" ||
            runtimeArgValue === "1";
          this._commandArgs.set(argDef.name, value ?? argDef.default ?? false);
          break;

        case "string":
          // Handle string arguments
          if (typeof runtimeArgValue !== "string") {
            throw new Error(`Expected a string for argument "${argDef.name}"`);
          }

          // Check for length constraints
          if (argDef.length) {
            const { min, max } = argDef.length;
            if (min !== undefined && runtimeArgValue.length < min) {
              throw new Error(
                `Argument "${argDef.name}" must have at least ${min} characters`
              );
            }
            if (max !== undefined && runtimeArgValue.length > max) {
              throw new Error(
                `Argument "${argDef.name}" must have at most ${max} characters`
              );
            }
          }

          // Check for choices
          if (argDef.choices && !argDef.choices.includes(runtimeArgValue)) {
            throw new Error(
              `Argument "${argDef.name}" must be one of: ${argDef.choices.join(
                ", "
              )}`
            );
          }

          // Custom validation
          if (argDef.validate && !argDef.validate(runtimeArgValue)) {
            throw new Error(`Validation failed for argument "${argDef.name}"`);
          }

          // Add the arg to the
          this._commandArgs.set(argDef.name, runtimeArgValue);
          break;

        case "number":
          // Handle number arguments
          const parsedValue = Number(runtimeArgValue);
          if (Number.isNaN(parsedValue)) {
            throw new Error(`Expected a number for argument "${argDef.name}"`);
          }

          // Check for range constraints
          if (argDef.range) {
            const { min, max } = argDef.range;
            if (min !== undefined && parsedValue < min) {
              throw new Error(
                `Argument "${argDef.name}" must be at least ${min}`
              );
            }
            if (max !== undefined && parsedValue > max) {
              throw new Error(
                `Argument "${argDef.name}" must be at most ${max}`
              );
            }
          }

          // Check for choices
          if (argDef.choices && !argDef.choices.includes(parsedValue)) {
            throw new Error(
              `Argument "${argDef.name}" must be one of: ${argDef.choices.join(
                ", "
              )}`
            );
          }

          // Custom validation
          if (argDef.validate && !argDef.validate(parsedValue)) {
            throw new Error(`Validation failed for argument "${argDef.name}"`);
          }
          break;

        default:
          exhaustiveMatchGuard(argDef);
      }
    }

    // Validate that all of the required args have been correctly
    // parsed and added to the _commandArgs
    for (const [argId, argDef] of Object.entries(argsDef)) {
      if (argDef.required && !this._commandOptions.has(argId)) {
        throw `Missing required option "${argId}"`;
      }
    }
  }

  public async execute() {
    // Get the runtime command
    const commandRes = tryHandleSync(this._parseExpression)();
    if (commandRes.hasError) {
      return this.throw(commandRes.error);
    }

    // Get the command definition from the runtime
    const { commandId, args, options } = commandRes.data;
    const commandDef = this._manifest.get(commandRes.data.commandId);
    if (!commandDef) {
      return this.throw(`Unknown Command "${commandId}"`);
    }

    // Check to see if we should just print the menu
    const isParentCommand = (commandDef.subCommands ?? []).length > 0;
    if (options.has("help") || isParentCommand) {
      return console.log(commandDef.data.help);
    }

    // Validate, parse, and set the command options
    const optionsFn = this._validateAndSetCommandOptions;
    const optionRes = tryHandleSync(optionsFn)(commandDef, options);
    if (optionRes.hasError) {
      return this.throw(optionRes.error);
    }

    // Validate, parse, and set the command args
    const argsFn = this._validateAndSetCommandArgs;
    const argsRes = tryHandleSync(argsFn)(commandDef, args);
    if (argsRes.hasError) {
      return this.throw(argsRes.error);
    }

    if (!commandDef.data.hasAction) {
      this.warn(
        "Command is valid but has no action. You should not be seeing this warning. Please log an issue."
      );
    }
    const importPath = path.resolve(this._cwd, commandDef.file);
    const module = await import(importPath);
    const action = module.action;
    await action({
      options: Object.fromEntries(this._commandOptions.entries()),
      args: Object.fromEntries(this._commandArgs.entries()),
    });
  }

  warn(error: any) {
    console.error(`\x1b[93m${String(error)}\x1b[0m`);
  }

  throw(error: any) {
    console.error(`\x1b[91m${String(error)}\x1b[0m`);
  }
}
