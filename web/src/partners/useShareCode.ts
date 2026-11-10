import { useCachedResource } from "../hooks/useCachedResource";
import type { Share } from "./types";

// Codes live only as long as this dialog. A tab uses its own cached response;
// switching away aborts an unfinished request rather than reusing another code.
export function useShareCode(path: string | null) {
  return useCachedResource<Share>(path);
}
