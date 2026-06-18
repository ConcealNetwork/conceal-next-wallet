// Records the conceal-lib-js source version in the vendored prebuild's
// package.json for traceability. The `concealjs --prebuild` CLI emits a
// version-less `concealjs-prebuilt` manifest, so after generating it we copy the
// installed conceal-lib-js version in — making it obvious which release the
// vendored WASM/JS came from (see issue #80). Runs as part of `concealjs:prebuild`.
import { readFileSync, writeFileSync } from "node:fs";

const SOURCE = "node_modules/conceal-lib-js/package.json";
const TARGET = "lib/conceal/concealjs/package.json";

const sourceVersion = JSON.parse(readFileSync(SOURCE, "utf8")).version;
if (!sourceVersion) {
  console.error(`Could not read conceal-lib-js version from ${SOURCE}`);
  process.exit(1);
}

const pkg = JSON.parse(readFileSync(TARGET, "utf8"));
pkg.concealLibJsVersion = sourceVersion;
writeFileSync(TARGET, `${JSON.stringify(pkg, null, 2)}\n`);
console.log(`Stamped ${TARGET} with conceal-lib-js v${sourceVersion}`);
