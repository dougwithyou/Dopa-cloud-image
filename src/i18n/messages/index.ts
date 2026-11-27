import type { Locale } from "@/i18n/config";
import { common } from "./common";
import { labels } from "./labels";
import { landing } from "./landing";
import { auth } from "./auth";

import { gallery } from "./gallery";

import { portal } from "./portal";

import { store } from "./store";

import { dash } from "./dash";

import { account } from "./account";

import { project } from "./project";

import { editor } from "./editor";

import { design } from "./design";

import { forms } from "./forms";

import { shop } from "./shop";

import { errors } from "./errors";

import { api } from "./api";

// Cada área define sus textos en español e inglés (ver src/i18n/define.ts).
const areas = { api, errors, shop, forms, design, editor, project, account, dash, store, portal, gallery, common, labels, landing, auth };

type Areas = typeof areas;
export type Messages = { [K in keyof Areas]: Areas[K]["es"] };

function build(locale: Locale): Messages {
  const out = {} as Record<string, unknown>;
  for (const [k, v] of Object.entries(areas)) out[k] = (v as { es: unknown; en: unknown })[locale];
  return out as Messages;
}

const dictionaries: Record<Locale, Messages> = { es: build("es"), en: build("en") };

export function getMessages(locale: Locale): Messages {
  return dictionaries[locale];
}
