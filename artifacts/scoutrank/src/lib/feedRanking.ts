/**
 * A real "For You"-style weighted ranking, not just chronological order
 * — but honest about what it's actually built from. This weighs the
 * signals ScoutRank genuinely has: your own sport, who you follow, and
 * how much a post is already resonating with others, blended with
 * recency and a touch of randomness so the order isn't perfectly
 * predictable or repetitive on every visit.
 *
 * DNA-attribute-aware ranking (surfacing posts tied to whichever
 * attribute you're weakest in) isn't included here — posts don't carry
 * any structured attribute tagging today, so there's nothing genuine to
 * weight on that front yet. Sport and engagement are the real, concrete
 * signals available right now.
 */

export interface RankablePost {
  id: string;
  created_at: string;
  profile_id: string;
  profiles?: { sport?: string | null } | null;
  reactionCount?: number;
  commentCount?: number;
}

interface RankingContext {
  viewerSport?: string | null;
  followingIds: Set<string>;
  /** How much random jitter to mix in, 0-1. Higher = more shuffled/less
   * predictable ordering, at the cost of relevance signals mattering
   * less. Defaults to a modest amount that mostly just breaks near-ties. */
  randomness?: number;
}

function recencyScore(createdAt: string): number {
  const hoursAgo = (Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60);
  // Decays toward 0 over about a week, never fully hits zero so very
  // old posts can still surface occasionally rather than becoming
  // permanently invisible.
  return 1 / (1 + hoursAgo / 36);
}

function engagementScore(post: RankablePost): number {
  const total = (post.reactionCount ?? 0) + (post.commentCount ?? 0) * 1.5;
  // Diminishing returns — a post with 200 reactions shouldn't dominate
  // 40x harder than one with 5, just noticeably more.
  return Math.log10(total + 1) / 3;
}

export function scorePost(post: RankablePost, ctx: RankingContext): number {
  let score = recencyScore(post.created_at) * 0.4;
  score += engagementScore(post) * 0.25;
  if (ctx.viewerSport && post.profiles?.sport === ctx.viewerSport) score += 0.25;
  if (ctx.followingIds.has(post.profile_id)) score += 0.3;
  score += Math.random() * (ctx.randomness ?? 0.35);
  return score;
}

export function rankPosts<T extends RankablePost>(posts: T[], ctx: RankingContext): T[] {
  return [...posts].sort((a, b) => scorePost(b, ctx) - scorePost(a, ctx));
}
