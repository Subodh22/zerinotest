import { NextResponse } from "next/server";
import { ZernioClient, ZernioError } from "@/src/zernio";

/**
 * Build a Zernio client on the server. The API key is read from the server-only
 * environment (ZERNIO_API_KEY in .env) and never sent to the browser.
 */
export function getClient(): ZernioClient {
  const key = process.env.ZERNIO_API_KEY;
  if (!key) throw new Error("ZERNIO_API_KEY is not set — add it to .env");
  return new ZernioClient(key);
}

/** Turn any thrown error into a clean JSON response with the right status code. */
export function errorResponse(e: unknown): NextResponse {
  if (e instanceof ZernioError) {
    return NextResponse.json(
      { error: e.message, status: e.status, body: e.body },
      { status: e.status },
    );
  }
  const message = e instanceof Error ? e.message : "Unknown error";
  return NextResponse.json({ error: message }, { status: 500 });
}
