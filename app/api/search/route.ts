import { NextResponse } from "next/server";
import { getCurrentMacCatalog, getPickupAvailability } from "@/lib/apple";

export const dynamic = "force-dynamic";

function normalizeZip(value: string) {
  const match = value.trim().match(/^(\d{5})(?:[-\s]?\d{4})?$/);
  return match?.[1];
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const zip = normalizeZip(searchParams.get("zip") ?? "");

  if (!zip) {
    return NextResponse.json({ error: "Enter a valid US ZIP code." }, { status: 400 });
  }

  try {
    const { models, filterOptions } = await getCurrentMacCatalog();
    const checkablePartNumbers = [
      ...new Set(models.map((model) => model.partNumber).filter((partNumber): partNumber is string => Boolean(partNumber))),
    ];
    let availabilityLookup: Awaited<ReturnType<typeof getPickupAvailability>> = {
      results: [],
      locationError: undefined,
    };

    try {
      availabilityLookup = await getPickupAvailability(zip, checkablePartNumbers);
    } catch (availabilityError) {
      const detail = availabilityError instanceof Error ? availabilityError.message : "Apple pickup lookup failed.";
      availabilityLookup.locationError = `Apple pickup is temporarily unavailable for this ZIP. ${detail}`;
    }

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
