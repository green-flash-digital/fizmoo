import type { CommandAction, CommandMeta } from "../../src/lib/index.js";

export const meta: CommandMeta = {
  name: "stuff",
  description:
    "A command that tests out the deeply nested file normalization command.",
};

export const action: CommandAction = () => {
  console.log("hello from normalize.base.deeply-nested.stuff");
};
