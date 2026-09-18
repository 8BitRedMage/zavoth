import { AskZavothTile } from "./components/AskZavothTile";
import { BrandTile } from "./components/BrandTile";
import { SummaryCard } from "./components/SummaryCard";
import { mockBrands, mockSummary } from "./mockData";

export function DashboardPage() {
  return (
    <>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] content-start gap-7 p-8">
        <SummaryCard summary={mockSummary} />
        {mockBrands.map((brand) => (
          <BrandTile key={brand.id} brand={brand} />
        ))}
      </div>
      <AskZavothTile />
    </>
  );
}
