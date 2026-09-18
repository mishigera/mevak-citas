module.exports = function (api) {
  api.cache(true);
  return {
    presets: [["babel-preset-expo", { unstable_transformImportMeta: true }]],
    env: {
      // Jest ejecuta en CommonJS: sin esto, `await import(...)` dentro de un queryFn
      // revienta con "A dynamic import callback was invoked without
      // --experimental-vm-modules" y la consulta falla antes de llegar al fetch.
      test: {
        plugins: ["babel-plugin-dynamic-import-node"],
      },
    },
  };
};
