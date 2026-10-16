// Vercel serverless function: live Taobao search for the static CARGO ONE site. Set OTAPI_KEY in the Vercel project.
import { handleLiveSearch } from '../server/live-search.mjs';

export default async function handler(req, res) {
  const url = new URL(req.url, 'https://localhost');
  try { await handleLiveSearch(req, res, url); }
  catch (e) { console.error(e); if (!res.headersSent) { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end('{"error":"server_error"}'); } }
}
