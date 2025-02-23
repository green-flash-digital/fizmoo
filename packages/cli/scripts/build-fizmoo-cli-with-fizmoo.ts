import { build } from "@fizmoo/core";
import { tryHandle } from "ts-jolt/isomorphic";

const res = await tryHandle(build)();
if (res.hasError) throw res.error;
console.log("Complete!", res.data);
