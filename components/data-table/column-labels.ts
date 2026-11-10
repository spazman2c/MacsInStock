export function columnLabel(id: string) {
  const labels: Record<string, string> = {
    family: "Model", model: "Model", id: "Model number", partNumber: "Model number",
    chip: "Chip", cores: "CPU / GPU", memory: "Memory", storage: "Storage", capacity: "Storage",
    finish: "Finish", carrier: "Carrier", availability: "Pickup", lastStockedAt: "Last stocked",
    locations: "Stores", releaseYear: "Release year", size: "Size", price: "Price", status: "Status",
  };
  return labels[id] ?? id.replace(/([a-z])([A-Z])/g, "$1 $2");
}
