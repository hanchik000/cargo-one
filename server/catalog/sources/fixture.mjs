// Fixture adapter: SAMPLE listings stored in this repository for tests and development.
// It is not connected to any marketplace and must never be presented as one (`live: false`, products flagged `sample`).
import fs from 'node:fs';

const FILE = new URL('./fixtures/sample-listings.json', import.meta.url);

export const fixtureAdapter = {
  id: 'fixture', label: 'Sample fixture (not a live marketplace)', kind: 'fixture', live: false, available: true,
  async listProducts() {
    const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    const fetchedAt = new Date().toISOString();
    return data.listings.map((l) => ({ ...l, source: 'fixture', fetchedAt }));
  },
};
