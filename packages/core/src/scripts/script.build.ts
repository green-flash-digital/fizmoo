import { DotDir } from "dotdir";
import { Fizmoo } from "../fizmoo/Fizmoo.js";
import { FizmooConfig } from "../schema/schema.js";

export async function build() {
  console.log("hello from build");

  // Get the configuration
  const dotDir = new DotDir<FizmooConfig>(); // included in this closure since build is a one time thing
  const res = await dotDir.find();

  // Create a new Fizmoo
  const fizmoo = new Fizmoo(res);
  const buildConfig = fizmoo.buildConfig;
  console.log(buildConfig);

  // TODO: Create the manifest by building the buildConfig with esbuild
  fizmoo.buildManifest();
}
