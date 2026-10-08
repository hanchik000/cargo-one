// Central dictionary. Every visible UI string lives here as [EN, RU, TK].
// Admin → Translations can override any key at runtime without code changes.
import { CORE } from './strings/core';
import { COMMERCE } from './strings/commerce';
import { LOGISTICS } from './strings/logistics';
import { ACCOUNT } from './strings/account';
import { AUTO } from './strings/auto';
import { ADMIN } from './strings/admin';
import { DESIGN } from './strings/design';
import { CATALOG } from './strings/catalog';

export const STRINGS = { ...CORE, ...COMMERCE, ...LOGISTICS, ...ACCOUNT, ...AUTO, ...ADMIN, ...DESIGN, ...CATALOG };
export type StringKey = keyof typeof STRINGS;
