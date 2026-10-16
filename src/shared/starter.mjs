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

/** Taobao searches natively in Chinese: the same categories, Chinese keywords. */
export const STARTER_QUERIES_TAOBAO = [
  ['无线耳机', 'electronics'], ['智能手表', 'electronics'], ['充电宝', 'electronics'], ['手机壳', 'electronics'],
  ['女包', 'fashion'], ['男士运动鞋', 'fashion'], ['卫衣', 'fashion'],
  ['厨房小工具', 'home'], ['LED台灯', 'home'], ['收纳盒', 'home'],
  ['化妆刷套装', 'beauty'], ['护肤品', 'beauty'],
  ['益智玩具', 'kids'],
  ['电钻', 'tools'], ['工具套装', 'tools'],
  ['车载手机支架', 'auto'], ['汽车用品', 'auto'],
];
export const starterFor = (provider) => (String(provider || '').toLowerCase() === 'taobao' ? STARTER_QUERIES_TAOBAO : STARTER_QUERIES);
