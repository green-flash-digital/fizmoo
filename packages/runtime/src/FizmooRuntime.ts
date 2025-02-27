import type { FizmooManifest, FizmooManifestEntry } from "@fizmoo/core";

type Command = {
  commandId: string;
  args: string[];
  options: string[];
  manifest: FizmooManifestEntry;
};

export class FizmooRuntime {
  private _command: Command;
  private _manifest: FizmooManifest;
  constructor(manifest: FizmooManifest) {
    this._manifest = manifest;
    this._command = this.normalizeCommand(process.argv.slice(2));
  }

  private normalizeCommand(positionArgs: string[]): Command {
    const commandParts = positionArgs.slice(1); // Ignore CLI name
    let commandPath: string[] = [];
    let remainingArgs = [...commandParts];
    let commandId = "";

    while (remainingArgs.length > 0) {
      let possibleCommand = commandPath.length
        ? `${commandPath.join(".")}.${remainingArgs[0]}`
        : remainingArgs[0];

      if (this._manifest[possibleCommand]) {
        commandId = possibleCommand;
        commandPath.push(remainingArgs.shift()!);
      } else {
        break; // Stop when no more commands match
      }
    }

    // Remaining elements are positional arguments or options
    let args = remainingArgs.filter((arg) => !arg.startsWith("--"));
    let options = remainingArgs.filter((arg) => arg.startsWith("--"));
    const manifest = this._manifest[commandId];

    if (!manifest) {
      throw new Error(`Unable to located a manifest for "${commandId}"`);
    }

    return {
      commandId,
      manifest,
      args,
      options,
    };
  }

  execute() {
    console.log(this._command);
  }
}
