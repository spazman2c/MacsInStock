import { NextResponse } from "next/server";
import { getCurrentMacCatalog, getPickupAvailability } from "@/lib/apple";

export const dynamic = "force-dynamic";

function isZip(value: string) {
  return /^\d{5}$/.test(value.trim());
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const zip = searchParams.get("zip")?.trim() ?? "";

  if (!isZip(zip)) {
    return NextResponse.json({ error: "Enter a valid 5 digit ZIP code." }, { status: 400 });
  }

  try {
    const { models, filterOptions } = await getCurrentMacCatalog();
    const checkablePartNumbers = models
      .map((model) => model.partNumber)
      .filter((partNumber): partNumber is string => Boolean(partNumber));
    const availabilityLookup = await getPickupAvailability(
      zip,
      checkablePartNumbers,
    );
    const availability = availabilityLookup.results;

    const storesByPart = availability.reduce<Record<string, typeof availability>>((acc, store) => {
      acc[store.partNumber] ??= [];
      acc[store.partNumber].push(store);
      return acc;
    }, {});

    return NextResponse.json({
      zip,
      checkedAt: new Date().toISOString(),
      filterOptions,
      availabilityError: availabilityLookup.locationError,
      models: models.map((model) => ({
        ...model,
        stores: model.partNumber ? (storesByPart[model.partNumber] ?? []) : [],
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Apple availability lookup failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
