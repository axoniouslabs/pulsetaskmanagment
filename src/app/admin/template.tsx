/** each admin page settles in on navigation */
export default function AdminTemplate({ children }: { children: React.ReactNode }) {
  return <div className="animate-page-in">{children}</div>;
}
