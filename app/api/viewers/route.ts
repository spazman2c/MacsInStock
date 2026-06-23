import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const VIEWER_TTL_MS = 30_000;

type ViewerStore = {
  viewers: Map<string, number>;
};

const globalViewerStore = globalThis as typeof globalThis & {
  __macsInStockViewers?: ViewerStore;
};

function getStore() {
  globalViewerStore.__macsInStockViewers ??= { viewers: new Map() };
  return globalViewerStore.__macsInStockViewers;
}

function pruneViewers() {
  const store = getStore();
  const cutoff = Date.now() - VIEWER_TTL_MS;

  for (const [id, lastSeen] of store.viewers.entries()) {
    if (lastSeen < cutoff) store.viewers.delete(id);
  }

  return store.viewers.size;
}

export async function GET() {
  return NextResponse.json({ count: pruneViewers() });
}

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as { id?: string; active?: boolean } | null;
  const id = typeof payload?.id === "string" ? payload.id.slice(0, 80) : "";

  if (!id) {
    return NextResponse.json({ error: "Missing viewer id." }, { status: 400 });
  }

  const store = getStore();
  if (payload?.active === false) {
    store.viewers.delete(id);
  } else {
    store.viewers.set(id, Date.now());
  }

  return NextResponse.json({ count: pruneViewers() });
}
