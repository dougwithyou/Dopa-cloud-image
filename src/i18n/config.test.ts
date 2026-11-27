import { test } from "node:test";
import assert from "node:assert/strict";
import { localeFromAcceptLanguage } from "./config.ts";

test("idioma del dispositivo", () => {
  assert.equal(localeFromAcceptLanguage("es-MX,es;q=0.9,en;q=0.8"), "es");
  assert.equal(localeFromAcceptLanguage("en-US,en;q=0.9"), "en");
  assert.equal(localeFromAcceptLanguage("pt-BR,es;q=0.8,en;q=0.5"), "es");
  assert.equal(localeFromAcceptLanguage("fr-FR,fr;q=0.9"), "en");
  assert.equal(localeFromAcceptLanguage("en;q=0.5,es;q=0.9"), "es");
  assert.equal(localeFromAcceptLanguage("ES"), "es");
  assert.equal(localeFromAcceptLanguage(""), "en");
  assert.equal(localeFromAcceptLanguage(null), "en");
  assert.equal(localeFromAcceptLanguage("*"), "en");
});
