import js from "@eslint/js";
import globals from "globals";
import conf from "eslint-config-google";
import jsdoc from 'eslint-plugin-jsdoc';

export default [
  js.configs.recommended,
  jsdoc.configs['flat/recommended'],
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
      globals: {
        ...globals.node,
        ...globals.mocha,
      }
    },
    rules: {
      ...conf.rules,
      'arrow-parens': ['error', 'as-needed'],
      'max-len': ['error', {
        code: 120,
        ignoreComments: true,
      }],
      'jsdoc/require-jsdoc': ['error', {
        require: {
          FunctionDeclaration: true,
          MethodDefinition: false,
          ClassDeclaration: false,
          ArrowFunctionExpression: false,
          FunctionExpression: false,
        },
      }],
      'valid-jsdoc': 'off',
      'require-jsdoc': 'off',
    }
  },
];
