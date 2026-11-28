export interface HotVideo {
  id: string;
  title: string;
  text: string;
  author: string;
  cover: string;
  url: string;
  sourceUrl: string;
  likes: number | null;
  views: number | null;
  comments: number | null;
  publishedAt: string;
  duration: number;
  imagePost?: boolean; // a 图文 post: pictures over music, no video to remake
}
export interface HotResult {
  items: HotVideo[];
  cursor: number;
  hasMore: boolean;
  searchId: string;
  backtrace: string;
  sortScope: string;
  cached: boolean;
  fetchedAt: string;
}
