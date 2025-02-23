import { Command } from "/Users/drewdecarme/git/green-flash-digital/fizmoo/packages/core/src/fizmoo/FizmooCommands.js";

export type WellFormedArgs = Record<string, string | number | boolean>;

export type WellFormedOptions = Record<string, string | number | boolean>;

export type WellFormedCommand = {
  command: Command;
  options: WellFormedOptions;
  args: WellFormedArgs;
};
