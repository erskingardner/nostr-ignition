export default [
    {
        env: {
            browser: true,
            es2021: true,
        },
        overrides: [],
        extends: ["standard-with-typescript", "prettier"],
        parserOptions: {
            ecmaVersion: "latest",
            sourceType: "module",
        },
        rules: {
            semi: "error",
            "prefer-const": "error",
        },
    },
];
