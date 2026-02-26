export interface FeedItem {
  guid: string;
  title: string;
  link: string;
  content: string;
  description: string;
  pubDate: string;
  imageUrl?: string;
}

export type DestinationName = "medium" | "substack" | "linkedin";

export interface DestinationResult {
  status: "success" | "failed" | "skipped";
  url?: string;
  postUrn?: string;
  error?: string;
  retryCount: number;
  lastAttempt: string;
}

export interface PublishedPost {
  beehiivGuid: string;
  beehiivUrl: string;
  title: string;
  publishedAt: string;
  destinations: Record<DestinationName, DestinationResult>;
}

export interface StateFile {
  posts: PublishedPost[];
}

export interface PublishPayload {
  title: string;
  htmlContent: string;
  canonicalUrl: string;
  description: string;
  imageUrl?: string;
}
