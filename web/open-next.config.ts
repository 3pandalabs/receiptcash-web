// See the note in wrangler.jsonc - src/proxy.ts was intentionally never
// added to avoid an upstream adapter/async_hooks incompatibility; auth is
// enforced at the layout level (apiGetCurrentUser()) and by the API's own
// requireAuth/requireAdmin checks.
import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default defineCloudflareConfig();
