## 2026-10-23 - Memoizing string tokenization in search scoring
**Learning:** Re-parsing and re-tokenizing static string tags and titles via regex during search filtering across catalog items adds significant CPU overhead (~8s for 10k calls). Caching `terms` tokenization results with a Map and pre-tokenizing query words drops search latency by ~58% (down to ~3.4s).
**Action:** When performing string tokenization/matching over static collections, cache the tokenized output in a Map or pre-tokenize before loop iterations.
