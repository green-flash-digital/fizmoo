import { writeFile } from "node:fs/promises";
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
   * The path of the command module relative to the manifest. This
   * is done via a relative path due to the fact that when the manifest
   * builds, the root file system will be different than at runtime. So
   * when we run it at runtime, we're looking up commands relative to
   * the directory that we're building everything into. This way, the parent
   * file system doesn't matter and all of our functionality can be contained
   * into one directory.
   */
  outPath: string;
  /**
   * The ID of the parent of the command. If there isn't a parent
   * then the parent command will be null
   */
  parentCommand: string | null;
  /**
   * A string literal representation of the help menu
   */
  help: string;
  /**
   * Other information to help parse and validate the command
   */
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

export class FizmooManifest {
  manifest: Map<string, ManifestEntry>;
  private _outFilePath: string;

  constructor(args: { outFilePath: string }) {
    this.manifest = new Map<string, ManifestEntry>();
    this._outFilePath = args.outFilePath;
  }

  private async validateCommandParent(_entry: ManifestEntry) {
    return new Promise<void>((res) => {
      LOG.debug(`Validating parent...`);
      setTimeout(() => {
        LOG.debug(`Validating parent... done.`);
        res();
      }, 500);
    });
  }

  private async validateCommandAction(_entry: ManifestEntry) {
    return new Promise<void>((res) => {
      LOG.debug(`Validating action...`);
      setTimeout(() => {
        LOG.debug(`Validating action... done.`);
        res();
      }, 500);
    });
  }

  async validate() {
    LOG.checkpointStart("Manifest:validate");
    // const commandIds = this.manifest.keys();

    await writeFile(
      this._outFilePath,
      JSON.stringify(Object.fromEntries(this.manifest.entries()), null, 2)
    );

    for await (const entry of this.manifest.values()) {
      LOG.checkpointStart(`Validating "${entry.id}"`);
      await this.validateCommandParent(entry);
      await this.validateCommandAction(entry);
      LOG.checkpointEnd();
    }

    LOG.checkpointEnd();
  }
  async build() {}
}
