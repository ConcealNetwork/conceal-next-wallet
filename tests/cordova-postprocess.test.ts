import { describe, expect, it } from "vitest";
import {
  cordovaPluginAddArgs,
  isCordovaPluginAlreadyInstalledError,
  parseCordovaPluginList,
  patchConfigXml,
  patchWorkerImportScripts,
  shouldRemoveCordovaFile,
} from "@/lib/cordova/shell-setup.mjs";
import {
  injectCordovaScript,
  injectPathNormScript,
  prefixForDepth,
  rewriteDotRelativePaths,
  rewriteRootAbsolutePaths,
  wwwDepth,
} from "@/lib/cordova/www-paths.mjs";

describe("wwwDepth", () => {
  it("returns 0 for www root index.html", () => {
    expect(wwwDepth("index.html")).toBe(0);
  });

  it("returns depth for nested route HTML", () => {
    expect(wwwDepth("wallet/send/index.html")).toBe(2);
    expect(wwwDepth("import/mnemonic/index.html")).toBe(2);
  });
});

describe("prefixForDepth", () => {
  it("uses ./ at root and ../ repeats for nested files", () => {
    expect(prefixForDepth(0)).toBe("./");
    expect(prefixForDepth(1)).toBe("../");
    expect(prefixForDepth(2)).toBe("../../");
  });
});

describe("rewriteRootAbsolutePaths", () => {
  it("rewrites href/src root paths for nested HTML", () => {
    const html =
      '<link href="/_next/static/chunks/app.css" /><script src="/lib/biginteger.js"></script>';
    expect(rewriteRootAbsolutePaths(html, "../../")).toBe(
      '<link href="../../_next/static/chunks/app.css" /><script src="../../lib/biginteger.js"></script>',
    );
  });

  it("rewrites quoted chunk paths in RSC payloads", () => {
    const payload = '["/_next/static/chunks/2_cp31pdnntsp.js"]';
    expect(rewriteRootAbsolutePaths(payload, "./")).toBe(
      '["./_next/static/chunks/2_cp31pdnntsp.js"]',
    );
  });

  it("leaves external URLs unchanged", () => {
    const html = '<a href="https://conceal.network">Conceal</a>';
    expect(rewriteRootAbsolutePaths(html, "./")).toBe(html);
  });
});

describe("rewriteDotRelativePaths", () => {
  it("rewrites ./_next on nested HTML to depth-relative paths", () => {
    const html =
      '<script src="./_next/static/chunks/app.js"></script><link href="./brand/mark.svg" />';
    expect(rewriteDotRelativePaths(html, 2)).toBe(
      '<script src="../../_next/static/chunks/app.js"></script><link href="../../brand/mark.svg" />',
    );
  });

  it("leaves root ./ paths unchanged", () => {
    const html = '<script src="./_next/static/chunks/app.js"></script>';
    expect(rewriteDotRelativePaths(html, 0)).toBe(html);
  });
});

describe("injectPathNormScript", () => {
  it("inserts pathname normalization at start of head", () => {
    const html = '<html><head><meta charset="utf-8"/></head><body></body></html>';
    const patched = injectPathNormScript(html);
    expect(patched).toContain('id="ccx-cordova-path"');
    expect(patched.indexOf("ccx-cordova-path")).toBeLessThan(patched.indexOf("charset"));
  });

  it("does not duplicate the normalization script", () => {
    const html = injectPathNormScript("<html><head></head></html>");
    expect(injectPathNormScript(html)).toBe(html);
  });
});

describe("injectCordovaScript", () => {
  it("inserts cordova.js before the first script tag (legacy setup-web-wallet.sh step 7)", () => {
    const html =
      '<html><head><script src="/_next/static/chunks/app.js" async=""></script></head><body><div>app</div></body></html>';
    expect(injectCordovaScript(html)).toBe(
      '<html><head><script type="text/javascript" src="/cordova.js"></script><script src="/_next/static/chunks/app.js" async=""></script></head><body><div>app</div></body></html>',
    );
  });

  it("uses origin-absolute cordova.js on nested route HTML", () => {
    const html =
      '<html><head><script src="/_next/static/chunks/app.js"></script></head><body></body></html>';
    expect(injectCordovaScript(html)).toContain('src="/cordova.js"');
  });

  it("does not duplicate cordova.js", () => {
    const html = '<head><script type="text/javascript" src="/cordova.js"></script></head>';
    expect(injectCordovaScript(html)).toBe(html);
  });
});

describe("patchConfigXml", () => {
  it("updates legacy src/index.html entry to index.html", () => {
    const xml = '<widget><content src="src/index.html" /></widget>';
    expect(patchConfigXml(xml)).toBe('<widget><content src="index.html" /></widget>');
  });
});

describe("patchWorkerImportScripts", () => {
  it("normalizes stale src/lib importScripts paths", () => {
    const source = "importScripts('../src/lib/biginteger.js');";
    expect(patchWorkerImportScripts(source)).toBe("importScripts('../lib/biginteger.js');");
  });

  it("normalizes absolute /lib importScripts paths", () => {
    const source = 'importScripts("/lib/decoder.min.js");';
    expect(patchWorkerImportScripts(source)).toBe('importScripts("../lib/decoder.min.js");');
  });
});

describe("shouldRemoveCordovaFile", () => {
  it("flags markdown and Next debug sidecars", () => {
    expect(shouldRemoveCordovaFile("lib/concealjs/README.md")).toBe(true);
    expect(shouldRemoveCordovaFile("__next._full.txt")).toBe(true);
    expect(shouldRemoveCordovaFile("index.html")).toBe(false);
  });
});

describe("cordovaPluginAddArgs", () => {
  it("includes plugin variables for camera", () => {
    expect(
      cordovaPluginAddArgs({
        id: "cordova-plugin-camera",
        spec: "^8.0.0",
        variables: { ANDROIDX_CORE_VERSION: "1.6.+" },
      }),
    ).toEqual([
      "plugin",
      "add",
      "cordova-plugin-camera@^8.0.0",
      "--variable",
      "ANDROIDX_CORE_VERSION=1.6.+",
    ]);
  });
});

describe("parseCordovaPluginList", () => {
  it("extracts plugin ids from cordova plugin ls output", () => {
    const output = `cordova-plugin-insomnia 4.3.0 "Insomnia"
cordova-plugin-camera 8.0.0 "Camera"`;
    expect([...parseCordovaPluginList(output)]).toEqual([
      "cordova-plugin-insomnia",
      "cordova-plugin-camera",
    ]);
  });
});

describe("isCordovaPluginAlreadyInstalledError", () => {
  it("detects platform file already exists failures", () => {
    expect(
      isCordovaPluginAlreadyInstalledError({
        stderr: 'Insomnia.java" already exists!',
      }),
    ).toBe(true);
  });
});
