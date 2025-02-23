import { exhaustiveMatchGuard } from "ts-jolt/isomorphic";
import { Options } from "/Users/drewdecarme/git/green-flash-digital/fizmoo/packages/core/src/types/types.js";
import type { WellFormedOptions } from "./runtime.types.js";

/**
 * Provided an array of arguments and some command options,
 * this function will parse and validate the options against
 * the command that was found
 */
export async function getOptions(argv: string[], cmdOptions: Options) {
  const parsedOptions = argv.reduce<WellFormedOptions>((accum, arg) => {
    // only process args that begin with a dash
    if (!arg.startsWith("-")) return accum;

    let optionKey = "";
    let optionValue: string | undefined;

    // full length
    if (arg.startsWith("--")) {
      const [rawOptionKey, rawOptionValue] = arg.split("=");
      optionKey = rawOptionKey.split("--")[1];
      optionValue = rawOptionValue;
    }
    // alias option
    else if (arg.startsWith("-")) {
      const [rawOptionKey, rawOptionValue] = arg.split("=");
      optionKey = rawOptionKey.split("-")[1];
      optionValue = rawOptionValue;
    }

    // Find the matching option from the command to process the option value
    const cmdOption = cmdOptions[optionKey];
    if (!cmdOption) {
      throw `"${optionKey}" is not a valid option`;
    }

    // Process the option value based upon the declared type
    switch (cmdOption.type) {
      case "boolean": {
        let value = undefined;
        if (optionValue === "true") value = true;
        if (optionValue === "false") value = false;
        if (typeof optionValue === "undefined") {
          // option is listed but has no value next to it
          value = cmdOption.default ?? true;
        }

        // value hasn't been reconciled from a default or logic yet so it's technically invalid
        if (typeof value !== "boolean") {
          throw `Invalid value "${optionValue}" for boolean option "${optionKey}". Value should either be "true", "false". As long as you haven't added a default value to the "defineOption" key, adding the option without a value will default to "true".`;
        }

        accum[optionKey] = value;
        break;
      }

      case "string": {
        const value = optionValue ? String(optionValue) : cmdOption.default;

        // Check for a type of string
        if (typeof value !== "string") {
          throw `Option "${optionKey}" must have a string value`;
        }

        accum[optionKey] = value;
        break;
      }

      case "number": {
        const value = optionValue ? Number(optionValue) : cmdOption.default;

        // check for a number
        if (Number.isNaN(value)) {
          throw `Option "${optionKey}" must be a parsable number.`;
        }

        // Check for a value
        if (typeof value === "undefined") {
          throw `Expected "${optionKey}" to have a value.`;
        }

        accum[optionKey] = value;
        break;
      }

      default:
        exhaustiveMatchGuard(cmdOption);
    }

    return accum;
  }, {});

  // Validate that all of the required options are present in the command
  const parsedOptionKeys = Object.keys(parsedOptions);
  for (const [cmdOptionKey, cmdOptionValue] of Object.entries(cmdOptions)) {
    if (cmdOptionValue.required && !parsedOptionKeys.includes(cmdOptionKey)) {
      throw `Missing required option "${cmdOptionKey}"`;
    }
  }

  return parsedOptions;
}
