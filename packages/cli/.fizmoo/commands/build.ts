import {
  type Meta,
  type Action,
  defineOptions,
  createFizmoo,
} from "@fizmoo/core";
import { tryHandle } from "ts-jolt/isomorphic";
import { buildOptionsSchema, LOG, validateOptions } from "./_utils/index.js";

export const meta: Meta = {
  name: "build",
  description: "test description",
};

export const options = defineOptions({
  debug: {
    alias: "d",
    description: "Run the build command with more verbose logging",
    type: "boolean",
    required: false,
  },
  autofix: {
    alias: "af",
    description:
      "Prompts the user to add a description to any missing command files during the build process",
    type: "boolean",
    required: false,
  },
  prompt: {
    alias: "p",
    description:
      "If any errors exist in the setup, the user will be prompted to fix them",
    type: "boolean",
    required: false,
  },
});

export const action: Action<never, typeof options> = async ({ options }) => {
  const opts = validateOptions(buildOptionsSchema, options);
  LOG.logLevel = opts.logLevel;

  const res = await tryHandle(createFizmoo)({
    test: "",
  });

  if (res.hasError) {
    return console.error(res.hasError);
  }
  LOG.debug("Complete!", res.data);
};
