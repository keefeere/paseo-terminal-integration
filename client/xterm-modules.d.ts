// Plugin client bundles build for a neutral platform, which ignores package "main" fields,
// so xterm is imported by file path. These map the paths back to the published typings.
declare module "@xterm/xterm/lib/xterm.mjs" {
  export * from "@xterm/xterm";
}

declare module "@xterm/addon-fit/lib/addon-fit.mjs" {
  export * from "@xterm/addon-fit";
}
