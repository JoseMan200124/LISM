export function JsonLd({ data }: Readonly<{ data: Record<string, unknown> }>) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
