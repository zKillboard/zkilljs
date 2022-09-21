# zkilljs

Current status: alpha

A rewrite of zkillboard using JavaScript Node and NPM packages.

## TODO

### Backend
- character apis (scoped sso v2)
- corporation apis (scoped sso v2)
- implement scope cleanup
- fetch insurance
- fetch implant slots (is this in esi item info now?)
- implement ganked detection
- (install) implement zkbsetup for wormhole classes (zkbsetup.php)
- implement redisq output
- implement wallet listening, applying adfree, and thank you evemails
- implement sponsorships (with label)

#### Done
- implement alltime ranking
- implement recent ranking (last 90 days)
- implement weekly ranking (last 7 days) 
- implement top all time
- Implemented Cron Instance (crinstance). Allows to the second cron type scheduling ensuring only one instance of a function is executing at a time.
- Fetch Dailies (from php zkill)
- Fetch location information (Thank you FuzzySteve)
- Fetch killmails from ESI
- Listen to RedisQ (from php zkill)
- Parse Killmails
- Populate/Update Factions
- Populate/Update Locations (using fetched location information)
- Populate/Update Information for: item_id, group_id, character_id, corporation_id, alliance_id, solar_system_id, constellation_id, region_id
- Populate/Update Prices (also currently using older zkill prices to fill in older data)
- fetch all wars
- fetch war details
- fetch war killmails
- Implemented sets to allow simultaneous processing while preventing too much happening at once
- implement dayDump for daily killmail_id/hash api


### Frontend

- implement sitemap (xml still?)
- implement job for queueRelated
- active pvp 
- Loot Fairy
- golden wrecks list
- Menu with Abyssal, Abyssal PVP, Awox, Big Kills, Citadels, Ganked, Solo, Sponsored, Highsec, Lowsec, Nullsec, W-Space, 5b+, 10b+, Capitals, Freighters, Rorquals, Supers
- Tracker, based on logged in char, corp, alli, etc. allow for any entity type
- Post killmails \o/
- Golden Wreck page
- Favorites (oh crap forgot about this completely)
- LastHour page (does anyone even use this?!)
- Login/Logout
- API removal
- Payments history
- Other account settings
- Add random hull destruction sound
- Add link to view raw killmail API
- Add link to save a killmail's fit (when logged in)
- Add External links, copy fit, etc.

#### Overview Page
- Statistics, Ships, ISK, Involved Pct, Ranks for each w/ Kills/Losses, Dangerous/Snuggly Bar, Gangs/Solo Bar
- Heat Map
- Top Chars, Corps, Ships, Systems, Locations
- Menu: Trophies(?), Ranks, Stats (use label dropdown?)

#### Done
- Most Valuable Kills
- Recent Kills (paginated)
- implement ztop
- Searching
- implement redis searching for names
- Char Info
- Top chars, corps, allis, ships
- Tickets (will not be implemented, we now use Discord)
- Menu: All, Kills, Losses, Top


### Probably won't do
- Map (will need a complete overhaul, so big big maybe)
- trophies
- implement hasSupers to show hasSupers on alli/corp pages (maybe, really only used by an elite few) and can be done with advanced search now
