import { input } from "@inquirer/prompts";
import { Isoscribe } from "isoscribe";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { tryHandle } from "ts-jolt/isomorphic";
import { fizmooConfigSchema } from "./_fizmoo.config.js";
import { writeFileRecursive } from "ts-jolt/node";

export const LOG = new Isoscribe({
  name: "@fizmoo/core",
  logFormat: "string",
  logLevel: "debug",
});

/**
 * A shared function that will prompt and then create the necessary
 * files to get fizmoo up and running.
 */
export async function bootstrap() {
  const rootDir = await input({
    message: `Where would you like to create your ".fizmoo/" dotdir?`,
    required: true,
    default: process.cwd(),
  });

  const packageJsonPath = path.resolve(rootDir, "./package.json");
  const fizmooDir = path.resolve(rootDir, "./.fizmoo");
  const fizmooConfigPath = path.resolve(fizmooDir, "./config.json");
  const commandsDir = path.resolve(fizmooDir, "./commands");
  let name = "";
  let description = "";

  // Try to default some options by importing the package.json
  const resPackageJson = await tryHandle(readFile)(packageJsonPath, "utf8");
  if (resPackageJson.data) {
    const json = JSON.parse(resPackageJson.data.toString());
    name = json.name ?? "";
    description = json.description ?? "";
  }

  // Ask and set the CLI name
  name = await input({
    message:
      "What would you like the CLI name to be? (This will also be the string used to instantiate the CLI)",
    default: name || undefined,
  });

  // Ask and set the CLI description
  description = await input({
    message: "Please provide a short description of the CLI's purpose & use",
    default: description || undefined,
  });

  // Ask and set the CLI commands dir
  const commandsDirRel = await input({
    message: `Where would you like to store your commands? (This path should be relative to ${fizmooDir})`,
    default: "./commands",
  });

  const configJson = fizmooConfigSchema.parse({
    name,
    description,
    commandsDir: commandsDirRel,
  });
  const fizmooConfigContent = JSON.stringify(configJson, null, 2);

  const configRes = await tryHandle(writeFileRecursive)(
    fizmooConfigPath,
    fizmooConfigContent
  );
  if (configRes.hasError) {
    throw configRes.error;
  }

  const myFirstCommandFilePath = path.resolve(commandsDir, "./start-here.ts");
  const myFirstCommandFileContent = `import type { Meta } from "fizmoo";

export const meta: Meta = {
  name: "start-here",
  description: "A standard command used to get started with Fizmoo",
};
`;
  const firstCommandRes = await tryHandle(writeFileRecursive)(
    myFirstCommandFilePath,
    myFirstCommandFileContent
  );
  if (firstCommandRes.hasError) {
    throw firstCommandRes.error;
  }

  return configRes.data;
}
