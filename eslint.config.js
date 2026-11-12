const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  { ignores: ["dist*/**", "backend/lib/**", "packages/**", "engineer-app/**", ".migration/**", "office-portal/**", "website/**"] },
]);
