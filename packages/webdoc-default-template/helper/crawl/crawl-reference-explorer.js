// @flow

const {SymbolLinks} = require("@webdoc/template-library");
const {traverse} = require("@webdoc/model");

/*::
import type {DocType} from "@webdoc/types";
import type {CategorizedDocumentList} from "./crawl";
*/

const DOC_TYPE_TO_TITLE = {
  "PackageDoc": "Packages",
  "ModuleDoc": "Modules",
  "NSDoc": "Namespaces",
  "ClassDoc": "Classes",
  "InterfaceDoc": "Interfaces",
  "FunctionDoc": "Functions",
  "TypedefDoc": "Type Definitions",
};

const HIERARCHY_SPECIFIERS = {
  "RootDoc": ["PackageDoc", "ModuleDoc",
    "ClassDoc", "InterfaceDoc", "FunctionDoc", "NSDoc", "TypedefDoc"],
  "PackageDoc": ["ClassDoc", "InterfaceDoc", "FunctionDoc", "NSDoc", "TypedefDoc"],
  "ModuleDoc": ["ClassDoc", "InterfaceDoc", "FunctionDoc", "NSDoc", "TypedefDoc"],
  "NSDoc": ["ClassDoc", "InterfaceDoc", "FunctionDoc", "TypedefDoc"],
};

// Categories into which API entities are divided
const CATEGORIES = [
  "namespaces",
  "classes",
  "enums",
  "events",
  "mixins",
  "interfaces",
  "typedefs",
];

// Crawls the tree searching for the API reference
function crawlReference(doc /*: Doc */) {
  const explorerHierarchy = buildExplorerHierarchy(doc);

  return buildExplorerTargetsTree(explorerHierarchy);
}

exports.crawlReference = crawlReference;

/*::
type ExplorerNode = {
  doc: Doc,
  children: CategorizedDocumentList,
*/

function buildExplorerHierarchy(rootDoc /*: RootDoc */) /*: ExplorerNode */ {
  const hierarchyStack /*: DocType[][] */ = [];
  const rootNode = {doc: rootDoc, children: {}};

  traverse(rootDoc, {
    enter(doc) {
      if (doc.type === "RootDoc") {
        hierarchyStack.push([rootNode]);
        return;
      }

      // Find which ancestor ExplorerNode which will accept this Doc
      const hierarchy = hierarchyStack[hierarchyStack.length - 1];
      let parent;

      for (let i = hierarchy.length - 1; i >= 0; i--) {
        const acceptedDocs = HIERARCHY_SPECIFIERS[hierarchy[i].doc.type];

        if (!acceptedDocs) {
          continue;
        }
        if (acceptedDocs.includes(doc.type)) {
          parent = i;
          break;
        }
      }

      if (typeof parent === "number") {
        const node = {doc, children: {}};

        // ExplorerNode is added to the hiearchy below the parent at index i
        hierarchyStack.push([...hierarchy.slice(0, parent + 1), node]);

        // Add as child to parentNode
        const parentNode = hierarchy[parent];

        if (!parentNode.children[doc.type]) {
          parentNode.children[doc.type] = [];
        }

        parentNode.children[doc.type].push(node);
      } else {
        // ExplorerNode ancestors are same and this doc is not included (pass-through)
        hierarchyStack.push([...hierarchy]);
      }
    },
    exit(doc) {
      hierarchyStack.pop();
    },
  });

  return rootNode;
}

function buildExplorerTargetsTree(node /*: ExplorerNode */, parentTitle /*: string */ = "") /*: ExplorerTarget */ {
  const doc = node.doc;
  let page;

  if (doc.type !== "RootDoc") {
    page = SymbolLinks.createLink(doc);

    SymbolLinks.registerLink(doc.path, page);
  }


  const sliceIndex = (parentTitle ? doc.path.indexOf(parentTitle) + parentTitle.length : -1) + 1;

  node.title = doc.path.slice(sliceIndex);

  const childNodes = node.children;
  const childrenCategories = Object.keys(node.children);

  if (childrenCategories.length > 0) {
    node.children = {};

    node.children.Overview = {
      title: "Overview",
      page,
    };

    if (node.doc.type === "RootDoc") {
      node.children.ClassIndex = {
        title: "Class Index",
        page: SymbolLinks.getFileName("Class-Index"),
      };
    }

    for (const [key, value] of Object.entries(childNodes)) {
      node.children[DOC_TYPE_TO_TITLE[key]] = value.map((cn) => buildExplorerTargetsTree(cn, node.title));
    }

    node.page = null;
  } else {
    node.page = page;
  }

  delete node.doc;
  return node;
}
