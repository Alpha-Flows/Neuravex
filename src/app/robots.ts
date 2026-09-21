import type { MetadataRoute } from "next";

/**
 * What a crawler may read at the root of this server.
 *
 * There was a `robots.txt` under `/sites/<slug>/`, where no crawler looks —
 * a crawler asks the origin for `/robots.txt` and nothing else. So the
 * builder's own pages had no `noindex` and no rule keeping anything out. That
 * only matters on an instance reachable from a network, which the default
 * install is not, and on one of those it matters a great deal: the admin
 * interface of an app with no sign-in is not a thing to have indexed.
 *
 * Published sites stay crawlable. They are the point.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/sites/" },
      { userAgent: "*", disallow: ["/admin/", "/api/", "/uploads/", "/"] },
    ],
  };
}
