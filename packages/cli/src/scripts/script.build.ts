import { createFizmoo } from "@fizmoo/core";
import {
  LOG,
  parseAndValidateOptions,
  buildOptionsSchema,
  FizmooBuildOptions,
} from "../utils/index.js";

export async function build(args: FizmooBuildOptions) {
  const options = parseAndValidateOptions(buildOptionsSchema, args);
  LOG.logLevel = options.logLevel;

  try {
    // TODO: Update the options for the createFizmoo
    const fizmoo = await createFizmoo({ test: "random" });
    await fizmoo.build();
  } catch (error) {
    LOG.fatal(new Error(String(error)));
  }
}
