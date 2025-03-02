import {
  fizmooConstants,
  type FizmooManifest,
  type FizmooManifestEntry,
  type Option,
} from "@fizmoo/core";
import path from "node:path";
import { exhaustiveMatchGuard, tryHandleSync } from "ts-jolt/isomorphic";
import { RuntimeError } from "./utils/util.error.js";

type RuntimeOption =
  | {
      type: "expanded";
      value: string | undefined;
      raw: string;
    }
  | { type: "alias"; value: string | undefined; raw: string };
type RuntimeOptionsMap = Map<string, RuntimeOption>;
type RuntimeArg = string | undefined;
type RuntimeArgsMap = Map<string, RuntimeArg>;

export class FizmooRuntime {
  _manifest: Map<string, FizmooManifestEntry>;
  private _commandOptions: Map<string, string | number | boolean>;
  private _commandArgs: Map<any, string | number | boolean>;
  private _cwd: string;
  private _errors: RuntimeError;

  constructor(manifest: FizmooManifest, options?: { cwd?: string }) {
    this._manifest = new Map(Object.entries(manifest));
    this._cwd = options?.cwd ?? import.meta.dirname;
    this._commandOptions = new Map();
    this._commandArgs = new Map();
    this._errors = new RuntimeError({
      cliName:
        this._manifest.get(fizmooConstants.COMMAND_ROOT)?.data.name ??
        "<your cli>",
    });
    this._parseExpression = this._parseExpression.bind(this);
    this._setCommandOptions = this._setCommandOptions.bind(this);
    this._setCommandArgs = this._setCommandArgs.bind(this);
  }

  /**
   * Parses the options from the expression into a workable format
   * that can be used to then compare against the command option definition
   */
  private _parseExpressionOptions(rawOptions: string[]): RuntimeOptionsMap {
    const optionsMap = new Map<string, RuntimeOption>();

    for (const rawOption of rawOptions) {
      const [optionKey, optionValue] = rawOption.split("=");

      // Handle an expanded alias
      if (optionKey.startsWith("--")) {
        const optionId = optionKey.replace("--", "");
        optionsMap.set(optionId, {
          type: "expanded",
          value: optionValue,
          raw: rawOption,
        });
        continue;
      }

      // Handle an alias option
      if (optionKey.startsWith("-")) {
        const optionId = optionKey.replace("-", "");
        optionsMap.set(optionId, {
          type: "alias",
          value: optionValue,
          raw: rawOption,
        });
        continue;
      }

      throw this._errors.COMMAND_NOT_FOUND(rawOption);
    }

    return optionsMap;
  }

  /**
   * Parses the args fro the expression into a workable format
   * that can be used to then compare against the command args definition
   */
  private _parseExpressionArgs(rawArgs: string[]): RuntimeArgsMap {
    const argsMap = new Map<string, RuntimeArg>();
    for (const rawArg of rawArgs) {
      const [argKey, argValue] = rawArg.split("=");
      argsMap.set(argKey, argValue);
    }
    return argsMap;
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
      throw this._errors.COMMAND_NOT_FOUND(argsRaw[0]);
    }

    if (commandId === "") {
      commandId = fizmooConstants.COMMAND_ROOT;
    }

    // Parse the options into a workable format
    const options = this._parseExpressionOptions(optionsRaw);
    const args = this._parseExpressionArgs(argsRaw);

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
  private _setCommandOptions(
    commandDef: FizmooManifestEntry,
    runtimeOptions: RuntimeOptionsMap
  ): void {
    const optionsDef = commandDef.data.options ?? {};

    // Loop through all of the runtime options to validate & parse
    for (const [rOptionId, rOption] of runtimeOptions) {
      let optionDef: Option | undefined = undefined;

      // Get the option definition. If the option that was provided at runtime
      // doesn't match an option in the options definition or the alias
      // provided at runtime isn't an alias defined in one of the options
      // we throw an error
      switch (rOption.type) {
        case "expanded":
          optionDef = optionsDef[rOptionId];
          if (!optionDef) {
            throw this._errors.OPTION_NOT_FOUND(
              rOptionId,
              "expanded",
              optionsDef
            );
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
            throw this._errors.OPTION_NOT_FOUND(rOptionId, "alias", optionsDef);
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
            throw this._errors.OPTION_VALIDATION_FAILED({
              optionId: rOptionId,
              message: `Invalid value "${rOption.value}" for boolean option "${rOptionId}".`,
              suggestion: `Possible values include:
  --${rOptionId}=true
  --${rOptionId}=false
  --${rOptionId} (absence of value: true || default set in command)`,
            });
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
            throw this._errors.OPTION_VALIDATION_FAILED({
              optionId: rOptionId,
              message: `Option "${rOptionId}" must have a string value`,
            });
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
            throw this._errors.OPTION_VALIDATION_FAILED({
              optionId: rOptionId,
              message: `Option "${rOptionId}" must be a parsable number.`,
            });
          }

          // Check for a value
          if (typeof value === "undefined") {
            throw this._errors.OPTION_VALIDATION_FAILED({
              optionId: rOptionId,
              message: `Expected "${rOptionId}" to have a value.`,
            });
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
        throw this._errors.OPTION_VALIDATION_FAILED({
          optionId: optionId,
          message: `Missing required option "${optionId}"`,
        });
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
  private _setCommandArgs(
    commandDef: FizmooManifestEntry,
    runtimeArgs: RuntimeArgsMap
  ) {
    const argsDef = commandDef.data.args ?? {};

    // Loop through all of the runtime args to validate & parse
    for (const [rArgId, rArg] of runtimeArgs) {
      const argDef = argsDef[rArgId];

      // Validate that the runtime arg is expected to be there
      if (!argDef) {
        throw this._errors.ARG_VALIDATION_FAILED({
          argId: rArgId,
          message: `Unexpected positional argument: "${rArg}"`,
        });
      }

      // Process the runtime option against the option definition
      // if it fails general validation it will throw with message
      switch (argDef.type) {
        case "boolean":
          // Handle boolean arguments
          const value = rArg?.toLowerCase() === "true" || rArg === "1";
          this._commandArgs.set(rArgId, value ?? argDef.default ?? false);
          break;

        case "string":
          // Handle string arguments
          if (typeof rArg !== "string") {
            throw this._errors.ARG_VALIDATION_FAILED({
              argId: rArgId,
              message: `The argument "${rArgId}" expected a string value but was called with "${rArg}"`,
              suggestion: `Ensure you are setting the argument equal to a string value e.g. "${rArgId}=<your value>"`,
            });
          }

          // Check for length constraints
          if (argDef.length) {
            const { min, max } = argDef.length;
            if (min !== undefined && rArg.length < min) {
              throw this._errors.ARG_VALIDATION_FAILED({
                argId: rArgId,
                message: `Argument "${rArgId}" must have at least ${min} characters`,
              });
            }
            if (max !== undefined && rArg.length > max) {
              throw this._errors.ARG_VALIDATION_FAILED({
                argId: rArgId,
                message: `Argument "${rArgId}" must have at most ${max} characters`,
              });
            }
          }

          // Check for choices
          if (argDef.choices && !argDef.choices.includes(rArg)) {
            throw this._errors.ARG_VALIDATION_FAILED({
              argId: rArgId,
              message: `"${rArg}" is not included in the available choices for ${rArgId}`,
              suggestion: `Argument "${rArgId}" must be one of: ${argDef.choices.join(
                ", "
              )}`,
            });
          }

          // Custom validation
          if (argDef.validate && !argDef.validate(rArg)) {
            throw this._errors.ARG_VALIDATION_FAILED({
              argId: rArgId,
              message: `Validation failed for argument "${rArgId}"`,
            });
          }

          // Add the arg to the
          this._commandArgs.set(rArgId, rArg);
          break;

        case "number":
          // Handle number arguments
          const parsedValue = Number(rArg);
          if (Number.isNaN(parsedValue)) {
            throw this._errors.ARG_VALIDATION_FAILED({
              argId: rArgId,
              message: `Expected a number for argument "${rArgId}"`,
            });
          }

          // Check for range constraints
          if (argDef.range) {
            const { min, max } = argDef.range;
            if (min !== undefined && parsedValue < min) {
              throw this._errors.ARG_VALIDATION_FAILED({
                argId: rArgId,
                message: `Argument "${rArgId}" must be at least ${min}`,
              });
            }
            if (max !== undefined && parsedValue > max) {
              throw this._errors.ARG_VALIDATION_FAILED({
                argId: rArgId,
                message: `Argument "${rArgId}" must be at most ${max}`,
              });
            }
          }

          // Check for choices
          if (argDef.choices && !argDef.choices.includes(parsedValue)) {
            throw this._errors.ARG_VALIDATION_FAILED({
              argId: rArgId,
              message: `"${rArg}" is not included in the available choices for ${rArgId}`,
              suggestion: `Argument "${rArgId}" must be one of: ${argDef.choices.join(
                ", "
              )}`,
            });
          }

          // Custom validation
          if (argDef.validate && !argDef.validate(parsedValue)) {
            throw this._errors.ARG_VALIDATION_FAILED({
              argId: rArgId,
              message: `Validation failed for argument "${rArgId}"`,
            });
          }
          break;

        default:
          exhaustiveMatchGuard(argDef);
      }
    }

    // Validate that all of the required args have been correctly
    // parsed and added to the _commandArgs
    for (const [argId, argDef] of Object.entries(argsDef)) {
      if (argDef.required && !this._commandArgs.has(argId)) {
        throw this._errors.ARG_VALIDATION_FAILED({
          argId: argId,
          message: `Missing required arg "${argId}"`,
        });
      }
    }
  }

  public async execute() {
    // Get the runtime command
    const commandRes = tryHandleSync(this._parseExpression)();
    if (commandRes.hasError) {
      return this._errors.log(commandRes.error);
    }

    // Get the command definition from the runtime
    const { commandId, args, options } = commandRes.data;
    const commandDef = this._manifest.get(commandRes.data.commandId);
    if (!commandDef) {
      return this._errors.log(this._errors.COMMAND_NOT_FOUND(commandId));
    }

    // Check to see if we should just print the menu
    const isParentCommand = (commandDef.subCommands ?? []).length > 0;
    if (options.has("help") || isParentCommand) {
      return console.log(commandDef.data.help);
    }

    // Validate, parse, and set the command options
    const optionsFn = this._setCommandOptions;
    const optionRes = tryHandleSync(optionsFn)(commandDef, options);
    if (optionRes.hasError) {
      return this._errors.log(optionRes.error);
    }

    // Validate, parse, and set the command args
    const argsFn = this._setCommandArgs;
    const argsRes = tryHandleSync(argsFn)(commandDef, args);
    if (argsRes.hasError) {
      return this._errors.log(argsRes.error);
    }

    // Run the action
    if (!commandDef.data.hasAction) {
      return this._errors.log(this._errors.MISSING_ACTION(commandId));
    }
    const importPath = path.resolve(this._cwd, commandDef.file);
    const module = await import(importPath);
    const action = module.action;

    await action({
      options: Object.fromEntries(this._commandOptions.entries()),
      args: Object.fromEntries(this._commandArgs.entries()),
    });
  }
}
