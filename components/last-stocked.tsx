export function LastStocked({ at, tracked = true }: { at?: string; tracked?: boolean }) {
  if (!tracked) return <span title="Apple does not expose pickup stock for this configuration.">Not tracked</span>;
  if (!at) return <span title="This browser has not observed stock for this product in the selected area.">Not observed</span>;
  return (
    <time dateTime={at} title={`Last observed in stock: ${new Date(at).toLocaleString()}`}>
      {new Date(at).toLocaleString([], { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}
    </time>
  );
}
