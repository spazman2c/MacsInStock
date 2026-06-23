import { NextResponse } from "next/server";
import { getRefurbishedCatalog } from "@/lib/refurbished";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const catalog = await getRefurbishedCatalog();
    return NextResponse.json(catalog);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Apple refurbished lookup failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
