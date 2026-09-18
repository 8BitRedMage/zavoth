function ComingSoon({ title, blurb }: { title: string; blurb: string }) {
  return (
    <div className="p-8">
      <p className="text-console-muted font-mono text-[11px] font-medium uppercase tracking-[1px]">
        {title}
      </p>
      <h1 className="text-console-fg mt-2 text-2xl font-bold">Coming soon</h1>
      <p className="text-console-muted mt-2 max-w-md text-sm">{blurb}</p>
    </div>
  );
}

export function AnalyticsPage() {
  return (
    <ComingSoon
      title="Analytics"
      blurb="Trends across website activity, hiring, sentiment, stock and news for every entity."
    />
  );
}

export function ReportsPage() {
  return (
    <ComingSoon
      title="Reports"
      blurb="Generate digests from any set of tagged entities and share them with your team."
    />
  );
}

export function IntegrationsPage() {
  return (
    <ComingSoon
      title="Integrations"
      blurb="Connect Slack, email and data sources to keep your streams flowing."
    />
  );
}
