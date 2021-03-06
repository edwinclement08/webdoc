// @flow

// This file provides langJS and langTS integration, both of which use Babel to generate
// symbols trees. These are registered in parse.js!

import buildSymbolTree from "./build-symbol-tree";
import type {LanguageConfig} from "../types/LanguageIntegration";

// Plugins for plain JavaScript files
const defaultPreset = [
  "asyncGenerators",
  "bigInt",
  "classPrivateMethods",
  "classPrivateProperties",
  "classProperties",
  "doExpressions",
  "dynamicImport",
  "exportDefaultFrom",
  "functionBind",
  "functionSent",
  "importMeta",
  "jsx",
  "logicalAssignment",
  "nullishCoalescingOperator",
  "numericSeparator",
  "objectRestSpread",
  "optionalCatchBinding",
  "optionalChaining",
  "throwExpressions",
];

// Plugins for JS+Flow files
const flowPreset = [
  ...defaultPreset,
  "flow",
  "flowComments",
];

// Plugins for TypeScript files
const tsPreset = [
  ...defaultPreset,
  "typescript",
];

export const langJS = {
  extensions: ["js", "jsx", "jsdoc"],
  parse(file: string, fileName: string, config: LanguageConfig): Symbol {
    // Flow is automatically handled!
    return buildSymbolTree(file, fileName, config, flowPreset);
  },
};

export const langTS = {
  extensions: ["ts", "tsx"],
  parse(file: string, fileName: string, config: LanguageConfig): Symbol {
    return buildSymbolTree(file, fileName, config, tsPreset);
  },
};
