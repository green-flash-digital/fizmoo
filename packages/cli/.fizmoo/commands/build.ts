import { type Meta, type Action, build } from "@fizmoo/core";
import { tryHandle } from "ts-jolt/isomorphic";

export const meta: Meta = {
  name: "build",
  description: "test description",
};

export const action: Action = async () => {
  const res = await tryHandle(build)();
  if (res.hasError) {
    return console.error(res.hasError);
  }
  console.log("Complete!", res.data);
};
