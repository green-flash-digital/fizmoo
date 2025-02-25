import { Args, Options } from "./_fizmoo.types.js";
import { LOG } from "./_fizmoo.utils.js";

export type Manifest = {
  [key: string]: ManifestEntry;
};

// ---- Start Types ----
export type ManifestEntry = {
  /**
   * The relative path of the command file to the
   * commands input and also the commands output dir
   */
  id: string;
  /**
   * The name of the command that will call
   */
  name: string;
  /**
   * Describes what the command does
   */
  description: string;
  /**
   * The segments of the command path
   */
  segments: string[];
  /**
   * Options that can be passed to the command action
   */
  options: Options;
  /**
   * Positional args that can be passed to the command action
   */
  args: Args | undefined;
  /**
   * The path of the command module relative to the manifest
   */
  path: string;
  /**
   * The IDs of this commands children
   */
  subCommands: string[];
  /**
   * A string literal representation of the help menu
   */
  help: string;
  /**
   * Other information to help parse and validate the command
   */
  meta: {
    /**
     * An array of command ids that are parent to this command
     */
    parentCommands: string[];
    /**
     * The level that the command sits at
     */
    level: number;
    /**
     * Boolean that represents the existence of an action
     * in the command file.
     */
    hasAction: boolean;
    /**
     * A boolean flag that indicates if the command definition
     * has any required args
     */
    hasRequiredArgs: boolean;
  };
};

export class FizmooManifest {
  manifest: Map<string, ManifestEntry>;

  constructor() {
    this.manifest = new Map<string, ManifestEntry>();
  }

  async validate() {
    LOG.checkpointStart("Manifest:validate");
    LOG.checkpointEnd();
  }
  async build() {}
}
