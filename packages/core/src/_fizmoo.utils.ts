import { Isoscribe } from "isoscribe";

export const LOG = new Isoscribe({
  name: "@fizmoo/core",
  logFormat: "string",
  logLevel: "debug",
});

import { Args, Options } from "./_fizmoo.types.js";

export type FizmooManifest = {
  [key: string]: FizmooManifestEntry;
};

export type FizmooManifestEntryData = {
  /**
   * The name of the command that will call
   */
  name: string;
  /**
   * Describes what the command does
   */
  description: string;
  /**
   * Options that can be passed to the command action
   */
  options: Options | undefined;
  /**
   * Positional args that can be passed to the command action
   */
  args: Args | undefined;
  /**
   * Does the command have an action export
   */
  hasAction: boolean;
  /**
   * A string literal representation of the help menu
   */
  help: string;
};

// ---- Start Types ----
export type FizmooManifestEntry = {
  /**
   * The path of the command module relative to the manifest. This
   * is done via a relative path due to the fact that when the manifest
   * builds, the root file system will be different than at runtime. So
   * when we run it at runtime, we're looking up commands relative to
   * the directory that we're building everything into. This way, the parent
   * file system doesn't matter and all of our functionality can be contained
   * into one directory.
   */
  file: string;

  src: string;
  /**
   * The IDs of the command parents
   */
  parents: string[] | null;
  /**
   * The ids of the immediate sub-commands
   */
  subCommands: string[] | null;
  data: FizmooManifestEntryData;
};
