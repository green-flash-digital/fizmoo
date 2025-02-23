import { type Meta, type Action, build } from "@fizmoo/core";
import { tryHandle } from "ts-jolt/isomorphic";

export const meta: Meta = {
  name: "build",
  description: "",
};

export const action: Action = async () => {
  const res = await tryHandle(build)();
  if (res.hasError) throw res.error;
  console.log("Complete!", res.data);
};
