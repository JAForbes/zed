- Added Transactions/Services/MVCC
- z.drain will resolve when all transactions running at the time of invocation finish.
- Added iterator support to queries
- realised get can't be an iterator because we want to cache the complete list, plus it is barely a perf improvement unless I rework get completely, and I just did that
- .$default, useful for ensuring values in the view
- Generally, pass handler around internally instead of proxy
- Fix conditional writes with filter
- Prevent write/traversal if result has same equality
- Cache value on write as well as read
- Cache proxies earlier in the query process than before
- Cache all values not just dynamics
- Use Maps for caches as they can be cleared easily without creating a new reference
- Proxies are now cached per Z instance
- Fixed property access after a dynamic
- Removed individual set/get/remove methods in favor of a single pass across all op types
- Removed meta in favor of path.