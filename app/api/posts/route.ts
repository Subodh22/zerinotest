import { NextResponse } from "next/server";
import { coerceArray } from "@/src/zernio";
import { getClient, errorResponse } from "@/lib/zernio-server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const z = getClient();
    const { searchParams } = new URL(req.url);
    const platform = searchParams.get("platform") || undefined;
    const accountId = searchParams.get("accountId") || undefined;

    // Fetch posts with a large limit and a wide date range (max 366 days) to get all posts
    const fromDate = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    const allPosts: unknown[] = [];
    let page = 1;
    const limit = 100;

    // Paginate through all results
    while (true) {
      const data = (await z.getAnalytics({ limit, platform, accountId, fromDate, page })) as {
        overview?: unknown;
        data?: unknown[];
        posts?: unknown[];
        pagination?: { totalPages?: number; page?: number };
      };

      const posts = data?.data ?? data?.posts ?? coerceArray(data);
      allPosts.push(...posts);

      // Stop if we got fewer than the limit (last page) or no pagination info
      const totalPages = data?.pagination?.totalPages;
      if (posts.length < limit || !totalPages || page >= totalPages) break;
      page++;
    }

    return NextResponse.json({ data: allPosts });
  } catch (e) {
    return errorResponse(e);
  }
}
