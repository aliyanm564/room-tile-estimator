import App from "@/components/app/App";
import { loadConfig } from "@/lib/catalog";

export default function Home() {
  // Config is validated on the server; a bad config file fails loudly here (and in tests).
  const { products, settings, branding } = loadConfig();
  return <App products={products} settings={settings} branding={branding} />;
}
