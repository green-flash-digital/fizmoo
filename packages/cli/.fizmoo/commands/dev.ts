import {
  type Meta,
  type Action,
  defineOptions,
  createFizmoo,
} from "@fizmoo/core";
import { buildOptionsSchema, LOG, validateOptions } from "./_utils/index.js";

export const meta: Meta = {
  name: "dev",
  description:
    "Start the fizmoo framework development server. Changes will trigger a rebuild",
};

export const options = defineOptions({
  debug: {
    alias: "d",
    description: "Run the build command with more verbose logging",
    type: "boolean",
    required: false,
  },
  autoInit: {
    alias: "ai",
    type: "boolean",
    description:
      "Automatically creates the directories and files needed if they aren't present. This is an extension of the `init` command.",
    default: true,
  },
});

export const action: Action<never, typeof options> = async ({ options }) => {
  const opts = validateOptions(buildOptionsSchema, {
    logLevel: options.debug ? "debug" : "info",
    autoInit: options.autoInit,
  });
  LOG.logLevel = opts.logLevel;

  const fizmoo = await createFizmoo({ ...opts, env: "development" });
  if (!fizmoo) return;
  await fizmoo.dev();
};
