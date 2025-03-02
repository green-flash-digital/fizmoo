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
});

export const action: Action<never, typeof options> = async ({ options }) => {
  const opts = validateOptions(buildOptionsSchema, {
    logLevel: options.debug ? "debug" : "info",
  });
  LOG.logLevel = opts.logLevel;

  const fizmoo = await createFizmoo({ logLevel: opts.logLevel });
  await fizmoo.dev();
};
