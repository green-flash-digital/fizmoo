import { DotDir } from "dotdir";
import { Fizmoo } from "../fizmoo/Fizmoo.js";
import { FizmooConfig } from "../schema/schema.js";
import { tryHandle } from "ts-jolt/isomorphic";

export async function build() {
  console.log("hello from build");

  // Get the configuration
  const dotDir = new DotDir<FizmooConfig>(); // included in this closure since build is a one time thing
  const res = await dotDir.find();

  // Create a new Fizmoo
  const fizmoo = new Fizmoo(res);

  // TODO: Create the manifest by building the buildConfig with esbuild
  const buildRes = await tryHandle(fizmoo.build)();
  if (buildRes.hasError) {
    throw buildRes.error;
  }
  console.log(buildRes);
}
