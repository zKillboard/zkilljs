# zkilljs

Current status: alpha

A rewrite of zkillboard using JavaScript Node and NPM packages.

## TODO

### Backend
- character apis
- corporation apis
- fetch insurance
- fetch implant slots (is this in esi item info now?)
- implement redis searching for names
- implement alltime ranking
- implement recent ranking (last 90 days) (can now use epoch)
- implement weekly ranking (last 7 days) (can now use epoch)
- implement scope cleanup
- implement top all time (use alltime label?)
- implement dayDump for daily killmail_id/hash api
- implement ganked detection (how to do these stats?)
- (install) implement zkbsetup for wormhole classes (zkbsetup.php)
- implement redisq output
- implement wallet listening, applying adfree, and thank you evemails
- implement sponsorships


### Frontend

- implement ztop
- implement sitemap (xml still?)
- implement job for queueRelated
- active php 
- Loot Fairy
- Top chars, corps, allis, ships
- golden wrecks list
- Map (will need a complete overhaul, so big big maybe)
- Menu with Abyssal, Abyssal PVP, Awox, Big Kills, Citadels, Ganked, Solo, Sponsored, Highsec, Lowsec, Nullsec, W-Space, 5b+, 10b+, Capitals, Freighters, Rorquals, Supers
- Tracker, based on logged in char, corp, alli, etc. allow for any entity type
- Post killmails \o/
- Golden Wreck page
- Favorites (oh crap forgot about this completely)
- LastHour page (does anyone even use this?!)
- Searching
- Login/Logout
- API removal
- Tickets
- Payments history
- Other account settings


#### Overview Page
- Char Info
- Statistics, Ships, ISK, Involved Pct, Ranks for each w/ Kills/Losses, Dangerous/Snuggly Bar, Gangs/Solo Bar
- Most Valuable Kills
- Recent Kills (paginated)
- Heat Map
- Top Chars, Corps, Ships, Systems, Locations
- Menu: All, Kills, Losses, Trophies(?), Top, Ranks, Stats (use label dropdown?), Supers (maybe? alliances)


### Probably won't do
- trophies (probably not)
- implement hasSupers to show hasSupers on alli/corp pages (maybe?)

## Completed
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
