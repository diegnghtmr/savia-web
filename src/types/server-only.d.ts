// The `server-only` marker package ships no type declarations. Declaring it
// here keeps `import "server-only"` type-checkable while preserving its real
// effect: the bundler refuses to include the module in a client graph.
declare module "server-only";
