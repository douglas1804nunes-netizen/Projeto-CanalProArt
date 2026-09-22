type PlaceholderPageProps = {
  title: string;
  phase: string;
};

export function PlaceholderPage({ title, phase }: PlaceholderPageProps) {
  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <div className="mt-4 rounded-lg border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">
        Esta tela ainda não foi implementada — chega em {phase} do roadmap.
      </div>
    </div>
  );
}
