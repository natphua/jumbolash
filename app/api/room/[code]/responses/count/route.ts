import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/supabase/admin";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ code: string }> },
) {
  try {
    const { code } = await context.params;
    const roomCode = code?.toUpperCase();

    if (!roomCode) {
      return NextResponse.json(
        { error: "Room code is required." },
        { status: 400 },
      );
    }

    const promptId = req.nextUrl.searchParams.get("promptId");

    if (!promptId) {
      return NextResponse.json(
        { error: "Prompt id is required." },
        { status: 400 },
      );
    }

    const { count, error } = await supabaseAdmin
      .from("Response")
      .select("id", { count: "exact", head: true })
      .eq("roomCode", roomCode)
      .eq("promptId", promptId);

    if (error) throw error;

    return NextResponse.json({ count: count || 0 }, { status: 200 });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to fetch response count.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
