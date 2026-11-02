import { useEffect, useState } from "react";
import { pageInfo, type PageId } from "../navigation";
import { canLeave, warnUnload } from "./unsaved";

function currentPage(): PageId {
  const id = location.hash.slice(1);
  return Object.hasOwn(pageInfo, id) ? (id as PageId) : "overview";
}

export function usePage() {
  const [page, setPage] = useState(currentPage);
  useEffect(() => {
    let previous = currentPage();
    const update = () => {
      if (
        !window.dispatchEvent(
          new Event("workspace:navigate", { cancelable: true }),
        ) ||
        !canLeave()
      ) {
        history.pushState(null, "", "#" + previous);
        return;
      }
      previous = currentPage();
      setPage(previous);
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", update);
    window.addEventListener("beforeunload", warnUnload);
    return () => {
      window.removeEventListener("hashchange", update);
      window.removeEventListener("beforeunload", warnUnload);
    };
  }, []);
  return [
    page,
    (id: PageId) => {
      location.hash = id;
    },
  ] as const;
}
