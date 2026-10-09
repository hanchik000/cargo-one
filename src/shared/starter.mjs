// Starter set for a paid aggregator source: one search page (40 items, 1 paid call) per query.
// Shared by the admin "starter set" button and the server's automatic first import (server/catalog/autoseed.mjs).
export const STARTER_PAGE = 40;
export const STARTER_QUERIES = [
  ['wireless earbuds', 'electronics'], ['smart watch', 'electronics'], ['power bank', 'electronics'], ['phone case', 'electronics'],
  ['women handbag', 'fashion'], ['men sneakers', 'fashion'], ['hoodie', 'fashion'],
  ['kitchen gadgets', 'home'], ['led lamp', 'home'], ['storage organizer', 'home'],
  ['makeup brush set', 'beauty'], ['skin care', 'beauty'],
  ['educational toys', 'kids'],
  ['cordless drill', 'tools'], ['tool set', 'tools'],
  ['car phone holder', 'auto'], ['car accessories', 'auto'],
];
