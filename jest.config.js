/** @type {import('jest').Config} */
const serverTransform = {
  "^.+\\.tsx?$": [
    "babel-jest",
    {
      babelrc: false,
      configFile: false,
      presets: [
        ["@babel/preset-env", { targets: { node: "current" } }],
        "@babel/preset-typescript",
      ],
    },
  ],
};

const moduleNameMapper = {
  "^@/(.*)$": "<rootDir>/$1",
  "^@shared/(.*)$": "<rootDir>/shared/$1",
};

module.exports = {
  projects: [
    {
      displayName: "server",
      testEnvironment: "node",
      testMatch: ["<rootDir>/tests/server/**/*.test.ts"],
      transform: serverTransform,
      moduleNameMapper,
      clearMocks: true,
    },
    {
      displayName: "app",
      preset: "jest-expo",
      testMatch: ["<rootDir>/tests/unit/**/*.test.{ts,tsx}"],
      moduleNameMapper,
      setupFiles: ["<rootDir>/tests/setup/app-setup.ts"],
      transformIgnorePatterns: [
        "node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|react-native-css-interop))",
      ],
      clearMocks: true,
    },
  ],

  collectCoverageFrom: [
    "app/**/*.{ts,tsx}",
    "server/**/*.ts",
    "components/**/*.tsx",
    "lib/**/*.ts",
    "contexts/**/*.tsx",
    "constants/**/*.ts",
    "shared/**/*.ts",
    "!**/*.d.ts",
    "!scripts/**",
  ],
  coverageDirectory: "coverage",
  coverageReporters: ["text-summary", "lcov", "json-summary"],

  // Umbrales algo por debajo de lo medido el 2026-09-17 (líneas 81,15%) para que
  // no salten por ruido, pero sí si alguien baja la cobertura de verdad.
  // Al cerrar la deuda §18 se desbloquea `app/client/[id].tsx` y habrá que subirlos.
  // OJO: un umbral por ruta SACA esos archivos del grupo "global", así que el número
  // global dejaría de significar "todo el repo". Por eso aquí solo hay global.
  // Medido el 2026-09-17 tras cerrar la deuda §18:
  // líneas 88,63% · sentencias 86,36% · ramas 77,19% · funciones 74,5%.
  // Los umbrales van un par de puntos por debajo para no saltar por ruido.
  coverageThreshold: {
    global: {
      lines: 87,
      statements: 85,
      branches: 75,
      functions: 72,
    },
  },
};
