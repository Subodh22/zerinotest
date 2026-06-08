import { NextResponse } from "next/server";
import {
  requireUserId,
  getUserAccounts,
  deleteAccount,
  AuthRequiredError,
} from "@/lib/user-accounts";

export const dynamic = "force-dynamic";

/** GET /api/auth/connected-accounts — list the current user's connected accounts. */
export async function GET() {
  try {
    const userId = await requireUserId();
    const accounts = await getUserAccounts(userId);
    return NextResponse.json({
      accounts: accounts.map((a) => ({
        id: a.id,
        provider: a.provider,
        label: a.label,
        createdAt: a.createdAt,
      })),
    });
  } catch (e) {
    if (e instanceof AuthRequiredError) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

/** DELETE /api/auth/connected-accounts — disconnect a provider. Body: { provider } */
export async function DELETE(req: Request) {
  try {
    const userId = await requireUserId();
    const { provider } = (await req.json()) as { provider?: string };
    if (!provider) {
      return NextResponse.json({ error: "provider is required" }, { status: 400 });
    }
    await deleteAccount(userId, provider);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof AuthRequiredError) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
