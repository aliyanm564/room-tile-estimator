import Calculator from "@/components/Calculator";
import { loadConfig } from "@/lib/catalog";

export default function Home() {
  // Validated on the server; a bad config file fails loudly here (and in tests).
  const { products, settings } = loadConfig();

  return (
    <main className="mx-auto w-full max-w-xl px-4 py-6 sm:py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">Hardwood Flooring Estimator</h1>
        <p className="mt-1 text-base text-stone-600">
          Enter the room size to see how much flooring to buy and what it will cost.
        </p>
      </header>
      <Calculator products={products} settings={settings} />
    </main>
  );
}
