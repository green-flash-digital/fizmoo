import { Meta, Action } from "@fizmoo/core";

export const meta: Meta = {
  name: "stuff",
  description:
    "A command that tests out the deeply nested file normalization command.",
};

export const action: Action = () => {
  console.log("hello from normalize.base.deeply-nested.stuff");
};
