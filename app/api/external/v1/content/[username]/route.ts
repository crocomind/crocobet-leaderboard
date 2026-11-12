import { allowedEmailDomains } from "@/lib/auth/config";
import { apiKeyRoute } from "@/lib/server/route";
import { getExternalContent } from "@/lib/server/services/external";

/**
 * One employee's approved posts, by email username (jdoe for
 * jdoe@crocobet.com), for other projects' backends. Contract:
 * docs/EXTERNAL_API.md.
 */
export const GET = apiKeyRoute<{ username: string }>(({ db, params }) =>
  getExternalContent(db, params.username, allowedEmailDomains()),
);
