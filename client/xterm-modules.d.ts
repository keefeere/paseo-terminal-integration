// Plugin client bundles build for a neutral platform, which ignores package "main" fields,
// so xterm is imported by file path. These map the paths back to the published typings.
declare module "@xterm/xterm/lib/xterm.mjs" {
  export * from "@xterm/xterm";
}

declare module "@xterm/addon-fit/lib/addon-fit.mjs" {
  export * from "@xterm/addon-fit";
}

declare module "@xterm/addon-web-links/lib/addon-web-links.mjs" {
  export * from "@xterm/addon-web-links";
}

declare module "@xterm/addon-webgl/lib/addon-webgl.mjs" {
  export * from "@xterm/addon-webgl";
}

declare module "@xterm/addon-unicode11/lib/addon-unicode11.mjs" {
  export * from "@xterm/addon-unicode11";
}
