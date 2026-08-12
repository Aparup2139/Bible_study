// Featured YouTube videos — four fixed slots shown under "Streaming Now" on Home.
export interface FeaturedVideo {
  /** 1..4 — stable position in the 2x2 grid. */
  slot: number;
  /** YouTube video id (the 11-char id from the embed/watch URL). null = slot not filled yet. */
  youtubeVideoId: string | null;
  /** Optional caption; '' when unset. */
  title: string;
}
