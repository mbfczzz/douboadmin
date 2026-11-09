import { useEffect, useState } from "react";
import { pageInfo, type PageId } from "../navigation";
import { canLeave, unsavedForm, warnUnload } from "./unsaved";

function currentPage(): PageId {
  const id = location.hash.slice(1);
  return Object.hasOwn(pageInfo, id) ? (id as PageId) : "overview";
}

export function usePage() {
  const [page, setPage] = useState(currentPage);
  useEffect(() => {
    let previous = currentPage(),
      approved = false;
    const update = () => {
      const next = currentPage();
      if (
        !window.dispatchEvent(
          new Event("workspace:navigate", { cancelable: true }),
        )
      ) {
        history.pushState(null, "", "#" + previous);
        return;
      }
      // Unsaved work: stay put, ask in-app, then continue if confirmed.
      if (!approved && unsavedForm()) {
        history.pushState(null, "", "#" + previous);
        void canLeave().then((ok) => {
          if (!ok) return;
          approved = true;
          location.hash = next;
        });
        return;
      }
      approved = false;
      previous = next;
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
