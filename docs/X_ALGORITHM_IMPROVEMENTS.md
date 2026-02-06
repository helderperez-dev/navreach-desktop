# X Algorithm Optimization Improvements

## Summary
Implemented comprehensive X algorithm optimizations to Reavion's X tools based on the open-sourced X "For You" algorithm. These changes maximize viral potential, engagement, and growth by leveraging the actual Phoenix model weights and ranking signals.

## Changes Made

### 1. New Algorithm Scoring Helpers (BASE_SCRIPT_HELPERS)

Added the following helper functions that understand X's algorithm:

- **`getTweetAge(tweetNode)`** - Returns age in minutes. Fresher content = better algorithmic velocity.
  
- **`hasVideoContent(tweetNode)`** - Detects videos which get VQV_WEIGHT bonus.

- **`hasImageContent(tweetNode)`** - Detects images which get photo_expand bonus.

- **`getTweetEngagementMetrics(tweetNode)`** - Extracts likes, replies, retweets from UI.

- **`getTweetAlgoScore(tweetNode)`** - **Most important!** Calculates a 0-100 algorithm score:
  - **Freshness** (age < 15 min = +40, < 1 hour = +30, < 3 hours = +15)
  - **Video content** = +25
  - **Image content** = +10
  - **High engagement velocity** (retweets > 10 = +15, likes > 50 = +10)
  - **Verification** (gold = +15, blue = +5)
  - **Already engaged** = -30 (diminishing returns)
  - **Promoted** = -100 (no algorithmic benefit)

### 2. Enhanced `x_scan_posts` Tool

- **New `min_algo_score` parameter** - Filter posts by algorithm score (recommended: 50+)
- **Each post now includes:**
  - `algoScore` (0-100)
  - `ageMinutes`
  - `freshness` label (golden/hot/warm/lukewarm/cold)
  - `hasVideo`, `hasImage`
  - `verifiedType`
  - `metrics` (likes, replies, retweets)
- **Results sorted by algoScore** descending for priority targeting
- **New `algoInsights` field** with recommendations:
  - Count of golden posts (< 15 min)
  - Count of hot posts (< 1 hour)
  - Count of video posts
  - Average score
  - Actionable recommendation

### 3. Enhanced `x_engage` Tool

- **New "Quintuple Threat" pattern** support:
  - like, follow, retweet, reply, **quote**
- **New `quoteText` parameter** for quote tweets
- **Updated description** to highlight algorithm optimization
- **Quote action implementation** with full modal handling

### 4. New `x_quote_tweet` Tool 🆕

High-value standalone tool for quote tweeting:
- P(quote) has HIGH weight because it creates a NEW content surface
- Extends your reach to the original author's audience
- Includes engagement logging

### 5. New `x_boost_my_post` Tool 🆕 (Golden Hour Mode)

Based on engagement velocity scoring:
- Navigate to YOUR recent post
- Auto-like all replies (sends engagement signals)
- Optional auto-reply with thanks
- Shows boost mode: CRITICAL (< 15 min), HIGH (< 1 hour), STANDARD
- Maximizes algorithmic amplification during critical first hour

### 6. New `x_visit_profile` Tool 🆕

Sends P(profile_click) signal:
- Visit profile before engaging to show genuine interest
- Configurable dwell time (longer = stronger signal)
- Auto-follow option
- Returns profile data for qualification

### 7. Updated Workflow: `/x_engage`

Complete rewrite with algorithm optimization focus:
- Explains X algorithm weights (retweet = 40x like, reply = 27x like)
- Details Golden Hour strategy
- Quintuple Threat pattern instructions
- Algorithm safeguards (avoid negative signals)
- Priority targeting based on algoScore

## Algorithm Weights (from X source code)

Based on `weighted_scorer.rs`:
- **P(retweet)** = 40x like weight (HUGE!)
- **P(reply)** = 27x like weight
- **P(follow)** = 4x like weight
- **P(quote)** = Extended reach (creates new content surface)
- **VQV (Video Quality View)** = Bonus for videos > certain duration
- **Freshness** = First 15-60 mins critical for velocity boost

## Usage Examples

### Scan for High-Value Targets
```
x_scan_posts({ min_algo_score: 60, limit: 10 })
```
Returns posts sorted by algorithm score, prioritizing golden/hot content.

### Quintuple Threat Engagement
```
x_engage({
  targetIndex: 0,
  actions: "like,follow,reply,retweet",
  replyText: "Great insight! What's your take on...",
  expected_author: "targethandle"
})
```

### Quote Tweet for Extended Reach
```
x_quote_tweet({
  index: 0,
  text: "This 🔥 Adding to this...",
  expected_author: "targethandle"
})
```

### Golden Hour Boost After Posting
```
x_boost_my_post({
  post_url: "https://x.com/yourhandle/status/123...",
  auto_like_replies: true,
  auto_reply_thanks: true
})
```

### Profile Visit Before Engaging
```
x_visit_profile({
  username: "targethandle",
  auto_follow: true,
  dwell_time_ms: 3000
})
```

## Files Modified

1. `src/main/services/site-tools/x-com.ts` - All tool implementations
2. `.agent/workflows/x_engage.md` - Updated workflow with algorithm strategy

## Next Steps

Consider implementing:
- [ ] Share via DM strategy (P(share_via_dm) signal)
- [ ] Block/mute detection and cooldown system
- [ ] Sentiment analysis for reply quality
- [ ] Author diversity tracking (avoid over-engaging with same author)
