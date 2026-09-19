const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
  },
  {
    // Todo aviso pasa por `alerta()`. `Alert.alert` no hace nada en web: ni diálogo ni
    // `onPress`, y los tests no lo ven porque corren como iOS (deuda §36, plan p007).
    files: ["app/**", "components/**", "contexts/**", "lib/**"],
    ignores: ["lib/alerta.ts"],
    rules: {
      "no-restricted-imports": ["error", {
        paths: [
          {
            name: "react-native",
            importNames: ["Alert"],
            message: "Usa alerta() de @/lib/alerta: Alert.alert no hace nada en web.",
          },
          {
            name: "react-toastify",
            message: "Usa alerta() de @/lib/alerta: los avisos van en el diálogo de vidrio.",
          },
        ],
      }],
    },
  },
]);
