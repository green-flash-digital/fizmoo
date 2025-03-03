import { Action, defineArgs, defineOptions, Meta } from "@fizmoo/core";

export const meta: Meta = {
  name: "parse",
  description: "A script to test single level args and options parsing",
};

export const args = defineArgs({
  path: {
    type: "string",
    name: "path",
    description: "The path of the command to parse",
    required: true,
  },
});

export const options = defineOptions({
  debug: {
    type: "boolean",
    description: "Debug any output by printing out the logs to the terminal",
    alias: "t",
  },
});

export const action: Action<typeof args, typeof options> = (params) => {
  console.log("Hello from the parse command.", params);
};
