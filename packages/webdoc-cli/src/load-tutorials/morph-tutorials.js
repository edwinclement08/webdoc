// @flow

import type {TutorialDoc} from "@webdoc/types";

// This file morphs the tutorials hiearchy to that specified by the tutorial JSON configurations
// provided by the user.

type TutorialReference = string;

type TutorialConfigurator = {
    "title": ?string,
    "children": TutorialConfigurator[] | {
      [id: string]: TutorialReference
    }
};

type TutorialConfiguration = { [id: string]: TutorialConfigurator }

// TutorialDB is the set of tutorial-docs
let tutorialDB = new Map<string, TutorialDoc>();

// The set of tutorials that have been referenced as a child of another tutorial. These
// are not added as top-level tutorials after being referenced.
let nestedTutorials = new Set<string>();

// Morph the tutorials into a graph-like structure as configured by the configuration file provided
// by the user.
//
// NOTE: The resulting tutorial-hierarchy need not be a simple tree and can be a cyclic, complex
// graph. Multiple tutorials can be the parent of one tutorial. That is why tutorialDoc.parent is
// not set.
export function morphTutorials(tutorials: TutorialDoc[], tconf: TutorialConfiguration): TutorialDoc[] {
  tutorialDB = new Map<string, TutorialDoc>();
  nestedTutorials = new Set<string>();

  tutorials.forEach((t) => tutorialDB.set(t.name, t));

  // This is the new list of tutorials
  const rootTutorials = [];

  // eslint-disable-next-line guard-for-in
  for (const [name, configurator] of Object.entries(tconf)) {
    // eslint-disable-next-line no-prototype-builtins
    if (!tconf.hasOwnProperty(name)) {
      continue;
    }

    const tdoc = resolveConfigurator(name, configurator);

    if (nestedTutorials.has(tdoc.name)) {
      continue;
    }

    rootTutorials.push(tdoc);
  }

  return rootTutorials;
}

// Resolve the configurator
function resolveConfigurator(
  name: string,
  configurator: TutorialConfigurator,
): TutorialDoc {
  const tdoc = tutorialDoc(name, configurator);

  if (!configurator.children) {
    return tdoc;
  }

  if (Array.isArray(configurator.children)) {
    configurator.children.forEach((childRef) => {
      nestedTutorials.add(childRef);
      tdoc.members.push(tutorialDoc(childRef));
    });
  } else {
    for (const [name, childConf] of Object.entries(configurator.children)) {
      // eslint-disable-next-line no-prototype-builtins
      if (configurator.children.hasOwnProperty(name)) {
        tdoc.members.push(tutorialDoc(name, childConf));
      }
    }
  }

  return tdoc;
}

// Fetch the tutorial-doc based off its name.
function tutorialDoc(name: string, configurator?: TutorialConfigurator) {
  if (!tutorialDB.has(name)) {
    throw new Error("There is no such tutorial '" + name + "'");
  }

  const tdoc = tutorialDB.get(name);

  if (configurator) {
    tdoc.title = configurator.title || name;
  }

  return tdoc;
}
