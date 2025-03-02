import { createFizmoo } from "@fizmoo/core";

async function buildFizmooCLIWithFizmoo() {
  const fizmoo = await createFizmoo({ logLevel: "trace" });
  await fizmoo.dev();
}

buildFizmooCLIWithFizmoo();
