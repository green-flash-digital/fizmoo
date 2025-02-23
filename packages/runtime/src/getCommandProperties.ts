import { Command } from "/Users/drewdecarme/git/green-flash-digital/fizmoo/packages/core/src/fizmoo/FizmooCommands.js";
import type { WellFormedArgs, WellFormedOptions } from "./runtime.types.js";

export function getCommandProperties(
  cmd: Command,
  parsedArgs: WellFormedArgs,
  parsedOptions: WellFormedOptions
) {
  const numOfArgs = Object.keys(cmd.args ?? {}).length;
  const numOfOptions = Object.keys(cmd.args ?? {}).length;
  const numOfParsedArgs = Object.values(parsedArgs).length;
  const numOfParsedOptions = Object.values(parsedOptions).length;

  return {
    hasSubCommands: Object.keys(cmd.subCommands).length > 0,
    isRootCommand: cmd.meta.level === 0,
    hasAction: cmd.meta.hasAction,
    hasNoArgsOrOptions: numOfArgs === 0 && numOfOptions === 0,
    numOfOptions,
    numOfArgs,
    numOfParsedArgs,
    numOfParsedOptions,
    hasNoParsedArgsOrOptions: numOfParsedArgs === 0 && numOfParsedOptions === 0,
  };
}
