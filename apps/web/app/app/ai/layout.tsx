/** AI & GPUs has its own colour: every accent inside these pages turns the chat's orange instead of the house green. */
export default function ComputeLayout({ children }: { children: React.ReactNode }) {
  return <div className="ai-zone">{children}</div>;
}
