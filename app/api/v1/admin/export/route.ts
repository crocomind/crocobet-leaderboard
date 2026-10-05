import { parseQuery } from "@/lib/server/http";
import { employeeRoute } from "@/lib/server/route";
import {
  exportQuerySchema,
  exportStandings,
} from "@/lib/server/services/admin";

export const GET = employeeRoute(
  async ({ request, db, config, now }) => {
    const { filename, csv } = await exportStandings(
      db,
      config,
      parseQuery(request, exportQuerySchema),
      now,
    );
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  },
  { admin: true },
);
