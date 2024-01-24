/* eslint-env node */
module.exports = {
    env: {
        browser: true,
        es2021: true,
    },
    overrides: [],
    parser: "@typescript-eslint/parser",
    extends: ["eslint:recommended", "plugin:@typescript-eslint/recommended", "prettier"],
    parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
    },
    plugins: ["@typescript-eslint"],
    rules: {
        semi: "error",
        "prefer-const": "error",
    },
    root: true,
};
