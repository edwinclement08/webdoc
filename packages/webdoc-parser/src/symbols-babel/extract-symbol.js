// @flow

// This file extracts all the symbol information from an AST node. It relies on extract-metadata
// as a helper.

import {
  type ArrowFunctionExpression,
  type FunctionExpression,
  type MemberExpression,
  type Node,
  type VariableDeclarator,
  isArrowFunctionExpression,
  isAssignmentExpression,
  isCallExpression,
  isClassDeclaration,
  isClassExpression,
  isClassMethod,
  isClassProperty,
  isExpressionStatement,
  isFunctionDeclaration,
  isFunctionExpression,
  isInterfaceDeclaration,
  isLiteral,
  isMemberExpression,
  isObjectExpression,
  isObjectMethod,
  isObjectProperty,
  isReturnStatement,
  isStringLiteral,
  isTSAsExpression,
  isTSDeclareFunction,
  isTSDeclareMethod,
  isTSEnumDeclaration,
  isTSEnumMember,
  isTSInterfaceDeclaration,
  isTSMethodSignature,
  isTSPropertySignature,
  isTSTypeElement,
  isThisExpression,
  isVariableDeclarator,
} from "@babel/types";

import {OBLIGATE_LEAF, PASS_THROUGH, type Symbol, VIRTUAL, isVirtual} from "../types/Symbol";
import {PARAMETER, queryType} from "../types/VariableRegistry";
import {
  extractExtends,
  extractImplements,
  extractParams,
  extractReturns,
  extractType,
} from "./extract-metadata";

// + Extract the symbol name, type from the Node
// + Set the appopriate flags
// + Set isInit & initComment if the symbol has a initializer child
export default function extractSymbol(
  node: Node,
  parent: Symbol,
  out: {
    name?: string,
    flags?: number,
    nodeSymbol?: Symbol,
    isInit?: boolean,
    initComment?: string,
    init?: Node
  },
): void {
  let name;
  let flags = out.flags || 0;
  let isInit = false;
  let initComment;
  let init;
  const nodeSymbol = out.nodeSymbol || {meta: {}};

  if ((isClassMethod(node) && (node.kind === "method" || node.kind === "constructor")) ||
        isObjectMethod(node) ||
        (isTSDeclareMethod(node) && (node.kind === "method" || node.kind === "constructor"))) {
    // Example:
    // constructor() {}
    // classMethod() {}
    // abstract classMethod() {}
    name = node.key.name;

    if (node.abstract) {
      nodeSymbol.meta.abstract = true;
    }

    nodeSymbol.meta.access = node.access;
    nodeSymbol.meta.scope = node.static ? "static" : "instance";
    nodeSymbol.meta.type = "MethodDoc";

    nodeSymbol.meta.params = extractParams(node);
    nodeSymbol.meta.returns = extractReturns(node);
  } else if (isClassProperty(node) ||
      (isClassMethod(node) && (node.kind === "get" || node.kind === "set"))) {
    // Examples:
    // classProperty = "value";
    // get classProperty() { <...> }
    // set classProperty(paramName) { <...> }

    name = node.key.name;

    nodeSymbol.meta.access = node.access || node.accessibility;
    nodeSymbol.meta.dataType = extractType(node);
    nodeSymbol.meta.scope = node.static ? "static" : "instance";
    nodeSymbol.meta.type = "PropertyDoc";

    if (isLiteral(node.value)) {
      if (isStringLiteral(node.value)) {
        // Quotes for strings
        nodeSymbol.meta.defaultValue = `"${node.value.value}"`;
      } else {
        nodeSymbol.meta.defaultValue = node.value.value;
      }
    }
  } else if (isClassDeclaration(node) || isClassExpression(node)) {
    // Example:
    // class ClassName {}

    name = node.id ? node.id.name : "";

    nodeSymbol.meta.extends = extractExtends(node);
    nodeSymbol.meta.implements = extractImplements(node);
    nodeSymbol.meta.type = "ClassDoc";
  } else if (isFunctionDeclaration(node) || isTSDeclareFunction(node)) {
    // Example:
    // function functionName()

    name = node.id ? node.id.name : "";

    nodeSymbol.meta.type = "FunctionDoc";

    nodeSymbol.meta.params = extractParams(node);
    nodeSymbol.meta.returns = extractReturns(node);
  } else if (
    isVariableDeclarator(node) ||
    isObjectProperty(node) ||
    (isExpressionStatement(node) &&
        isMemberExpression(node.expression.left) &&
        !node.expression.left.computed) // don't generate symbols for "objectName[variableName]"
  ) {
    // Examples:
    // const symbolName;
    // let symbolName;
    // const symbolName      = <Literal> | <ClassExpression> | <FunctionExpression>;
    // let symbolName        = <Literal> | <ClassExpression> | <FunctionExpression>;
    // this.memberName       = <Literal> | <ClassExpression> | <FunctionExpression>;
    // ObjectName.memberName = <Literal> | <ClassExpression> | <FunctionExpression>;
    // let symbolName = (() => <ClassExpression> | <FunctionExpression)();
    // let symbolName = (function() { class symbolName {}; return symbolName; })();
    // propertyName:           <Literal> | <ClassExpression> | <FunctionExpression>,

    // NOTE: If this type of symbol is initialized to a <ClassExpression> or <FunctionExpression>,
    // it treated as a virtual symbol so that the assigned class/function (i.e. initially a child
    // of this symbol) will be lifted-up.

    // NOTE-2: A symbol can be initialized using a call expression to an inner function expression,
    // which is also treated as above. However, the call-expression itself is also becomes a virtual
    // symbol.

    let shouldSkip = false;

    if (isExpressionStatement(node)) {
      name = node.expression.left.property.name;
      init = node.expression.right;

      const rootName = resolveRootObject(node.expression.left);

      if (queryType(rootName) === PARAMETER) {
        shouldSkip = true;
        name = null;
      }
    } else if (isVariableDeclarator(node)) {
      name = node.id.name;
      init = resolveInit(node);
    } else {// ObjectProperty
      name = node.key.name;
      init = node.value;
    }

    if (!shouldSkip) {
      if (isClassExpression(init) || isFunctionExpression(init) ||
          isArrowFunctionExpression(init) ||
          (isCallExpression(init) &&
          (isFunctionExpression(init.callee) || isArrowFunctionExpression(init.callee)))) {
        flags |= PASS_THROUGH | VIRTUAL;
        isInit = true;

        // Handled later
      } else if (!isObjectExpression(init)) {
        flags |= OBLIGATE_LEAF;
        nodeSymbol.meta.type = "PropertyDoc";
      } else {
        nodeSymbol.meta.type = "PropertyDoc";
      }

      if (isExpressionStatement(node)) {
        // Literal property

        nodeSymbol.meta.object = resolveObject(node.expression.left);
        nodeSymbol.meta.scope = isInstancePropertyAssignment(node.expression.left) ?
          "instance" : "static";

        if (nodeSymbol.meta.scope === "instance" &&
              nodeSymbol.meta.object.includes(".prototype")) {
          // webdoc doesn't really support .prototype.prototype (multiple prototypes)
          // Should we?
          // It would probably be implemented as a document-tree mod that climbs the
          // inheritance/super-class chain.
          nodeSymbol.meta.object = nodeSymbol.meta.object.replace(".prototype", "");
        }
      } else if (isObjectProperty(node)) {
        nodeSymbol.meta.scope = "static";
      }

      if (isFunctionExpression(init) || isArrowFunctionExpression(init)) {
        nodeSymbol.meta.type = isObjectProperty(node) ? "MethodDoc" : "FunctionDoc";

        nodeSymbol.meta.params = extractParams(init);
        nodeSymbol.meta.returns = extractReturns(init);
      } else if (isClassExpression(init)) {
        nodeSymbol.meta.type = "ClassDoc";
      }
    }
  } else if (isInterfaceDeclaration(node) || isTSInterfaceDeclaration(node)) {
    // Example:
    // interface InterfaceName {}
    //
    // Interfaces are compile-time only types and can't be assigned as values.

    name = node.id.name;

    nodeSymbol.meta.extends = extractExtends(node);
    nodeSymbol.meta.type = "InterfaceDoc";
  } else if (isTSEnumDeclaration(node)) {
    // Example:
    // enum EnumName {}
    //
    // Enumerations are compile-time only
    // TODO: Support EnumDoc in @webdoc/legacy-template

    name = node.id.name;

    nodeSymbol.meta.type = "EnumDoc";
  } else if (isTSEnumMember(node)) {
    // Example:
    // ENUM_MEMBER,
    // ENUM_MEMBER = 100,

    name = node.id.name ? node.id.name : node.id.value;

    // TODO: Extract the value of the enum member if it isn't a literal. This would occur
    // by taking it out of the file contents

    nodeSymbol.meta.constant = true;
    nodeSymbol.meta.value = isLiteral(node) ? node.value : null;
    nodeSymbol.meta.type = "PropertyDoc";

    // Don't traverse through the initializer even if it isn't a literal
    flags |= OBLIGATE_LEAF;
  } else if (isTSTypeElement(node)) {
    // This type of node occurs when declaring interface members.
    // Example:
    // memberName: memberType;
    // methodName(param: ParamType): ReturnType;

    name = node.key ? node.key.name : "";

    if (isTSMethodSignature(node)) {
      nodeSymbol.meta.params = extractParams(node);
      nodeSymbol.meta.returns = extractReturns(node);
      nodeSymbol.meta.type = "MethodDoc";
    } else if (isTSPropertySignature(node)) {
      // TODO: dataType
      nodeSymbol.meta.type = "PropertyDoc";
    }

    flags |= OBLIGATE_LEAF;
  } else if (parent && isVirtual(parent) &&
    isCallExpression(node) &&
    (isFunctionExpression(node.callee) || isArrowFunctionExpression(node.callee))) {
    // Examples: The call expressions in
    // (function() { class symbolName {}; return symbolName; })();
    // (() => class symbolName {})();
    //
    // This occurs when this type of initialization is used to assign a variable/property

    flags |= VIRTUAL;
    const callee = node.callee;
    const returnedSymbol = resolveReturn(callee);

    if (returnedSymbol) {
      isInit = true;
      initComment = "";
      name = returnedSymbol;
    }
  }

  out.name = name;
  out.flags = flags;
  out.isInit = isInit;
  out.initComment = initComment;
  out.init = init;
  out.nodeSymbol = nodeSymbol;
}

// Resolve the initialization literal for the variable
function resolveInit(node: VariableDeclarator): Node {
  // Example: const ClassName = exports.ClassName = class ClassName {}
  if (isAssignmentExpression(node.init)) {
    return resolveInit(node.init);
  }

  return node.init;
}

// Resolve the returned symbol for a function expression with a body
function resolveReturn(callee: FunctionExpression | ArrowFunctionExpression): ?string {
  // Example: function () { const Symbol = class {}; return Symbol; }
  if (callee.body && callee.body.body) {
    const body = callee.body.body;
    const lastStatement = body[body.length - 1];

    if (isReturnStatement(lastStatement) && lastStatement.argument && lastStatement.argument.name) {
      return lastStatement.argument.name;
    }
  }
}

// Helper to resolve assignment to object chain, e.g. [Class.prototype].property
function resolveObject(expression: MemberExpression): void {
  let longname = "";
  expression = expression.object;

  if (isTSAsExpression(expression)) {
    expression = expression.expression;
  }
  if (isThisExpression(expression)) {
    return "this";
  }

  while (expression.object) {
    longname = expression.property.name + (longname ? "." + longname : "");
    expression = expression.object;
  }

  longname = (isThisExpression(expression) ? "this" : expression.name) +
    (longname ? "." : "") + longname;

  return longname;
}

function resolveRootObject(expression: MemberExpression): void {
  expression = expression.object;

  if (isTSAsExpression(expression)) {
    expression = expression.expression;
  }
  if (isThisExpression(expression)) {
    return "this";
  }

  while (expression.object) {
    expression = expression.object;
  }

  return isThisExpression(expression) ? "this" : expression.name;
}

// Whether the member expression assigns to this, e.g.
// this.member.inside.deep -> true
// top.inside -> false
function isInstancePropertyAssignment(expr: MemberExpression): boolean {
  if (isThisExpression(expr.object)) {
    return true;
  }
  if (isMemberExpression(expr.object)) {
    if (expr.object.property.name === "prototype") {
      return true;
    }

    return isInstancePropertyAssignment(expr.object);
  }

  return false;
}
