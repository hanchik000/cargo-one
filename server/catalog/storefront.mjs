// Storefront switches shared by the admin API and the automatic first import.
import { tx } from '../db/index.mjs';
import * as R from './repository.mjs';

/** Publishes the drafts created/updated by one import run. Returns how many became published. */
export function publishImported(db, items, actor, runId) {
  const ids = [...new Set((items || []).filter((i) => i.productId && i.outcome !== 'failed').map((i) => i.productId))];
  const t = new Date().toISOString();
  let published = 0;
  tx(db, () => {
    const up = db.prepare("UPDATE products SET status = 'published', published_at = COALESCE(published_at, ?), updated_at = ? WHERE id = ? AND origin = 'imported' AND status = 'draft'");
    for (const id of ids) published += up.run(t, t, id).changes;
  });
  if (published) R.audit(db, actor, 'catalog.publish_import', runId, { published });
  return published;
}

/** Hides (reversibly: they become drafts, not deleted) or shows the bundled DEMO products. */
export function setDemoVisible(db, visible, actor) {
  const t = new Date().toISOString();
  const r = visible
    ? db.prepare("UPDATE products SET status = 'published', updated_at = ? WHERE demo = 1 AND status = 'draft' AND json_extract(legacy, '$.hiddenDemo') = 1").run(t)
    : db.prepare("UPDATE products SET status = 'draft', updated_at = ?, legacy = json_set(COALESCE(legacy, '{}'), '$.hiddenDemo', 1) WHERE demo = 1 AND status = 'published'").run(t);
  if (visible) db.prepare("UPDATE products SET legacy = json_remove(legacy, '$.hiddenDemo') WHERE demo = 1 AND json_extract(legacy, '$.hiddenDemo') = 1 AND status = 'published'").run();
  R.audit(db, actor, visible ? 'catalog.demo_show' : 'catalog.demo_hide', null, { changed: r.changes });
  return { changed: r.changes, demoPublished: db.prepare("SELECT COUNT(*) AS n FROM products WHERE demo = 1 AND status = 'published'").get().n };
}
