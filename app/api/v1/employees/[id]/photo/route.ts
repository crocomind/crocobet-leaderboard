import { HttpError } from "@/lib/server/http";
import { employeeRoute } from "@/lib/server/route";
import { uuidSchema } from "@/lib/server/schemas";
import { getPhoto } from "@/lib/server/services/posts";

/** Profile photos stay behind sign-in; browsers cache them for a day. */
export const GET = employeeRoute<{ id: string }>(
  async ({ request, params, db }) => {
    const id = uuidSchema.safeParse(params.id);
    const photo = id.success ? await getPhoto(db, id.data) : null;
    if (!photo) throw new HttpError(404, "not_found", "No photo");

    const etag = `"${photo.etag}"`;
    const headers = {
      ETag: etag,
      "Cache-Control": "private, max-age=86400",
      "X-Content-Type-Options": "nosniff",
    };
    if (request.headers.get("if-none-match") === etag)
      return new Response(null, { status: 304, headers });
    return new Response(new Uint8Array(photo.bytes), {
      headers: { ...headers, "Content-Type": photo.contentType },
    });
  },
);
