import RCSlabCalculator from "./components/rc-slab-calculator";

export default function App() {
  return (
    <RCSlabCalculator
      title="RC Slab Design Calculator"
      onClose={() => window.scrollTo({ top: 0, behavior: "smooth" })}
    />
  );
}
