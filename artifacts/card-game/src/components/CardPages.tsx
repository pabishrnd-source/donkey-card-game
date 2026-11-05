import { Children, type ReactNode, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

// Paging keeps every card reachable without shrinking touch targets or scrolling.
export function CardPages({ children }: { children: ReactNode }) {
  const cards = Children.toArray(children);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(() => window.innerWidth <= 600 ? 4 : 8);
  useEffect(() => {
    const query = window.matchMedia("(max-width:600px)");
    const update = () => { setPageSize(query.matches ? 4 : 8); setPage(0); };
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  const pages = Math.max(1, Math.ceil(cards.length / pageSize));
  const current = Math.min(page, pages - 1);
  return <div className="card-pages">
    <div className="card-pages-items">{cards.map((card, index) => <div key={index} className={Math.floor(index / pageSize) === current ? "card-page-visible" : "card-page-hidden"}>{card}</div>)}</div>
    <div className="card-page-controls">
      <button type="button" disabled={current === 0} onClick={() => setPage(current - 1)} aria-label="Previous cards" title="Previous cards"><ChevronLeft /></button>
      <span>{current + 1}/{pages}</span>
      <button type="button" disabled={current === pages - 1} onClick={() => setPage(current + 1)} aria-label="Next cards" title="Next cards"><ChevronRight /></button>
    </div>
  </div>;
}
