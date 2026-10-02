# The fonts, kept here rather than fetched from Google

The three Hebrew faces the app offers are served from this folder, on the
same server as everything else.

They used to be fetched from `fonts.googleapis.com` the moment the page
opened. Three things were wrong with that:

- **Every reader was announced to Google.** Opening the page to say Tehillim
  sent a request carrying the reader's address to a third party, before a
  word was read. Nothing else on this site talks to anyone but this server.
- **It is a second blocking stylesheet.** The page could not paint until a
  request to another company's server came back.
- **With no signal there was no font.** The service worker holds the page,
  the Hebrew and the English; it could not hold a file it is not allowed to
  cache. Offline, the Hebrew fell back to whatever the phone had.

Only the Hebrew subset of the family actually chosen is downloaded, because
each `@font-face` names the range of letters it covers and a browser fetches
a font file only when it has a letter to set with it. Choosing "Your
device's font" in Settings downloads nothing at all.

| Family | Files here | Licence |
| --- | --- | --- |
| Frank Ruhl Libre | one variable file per subset, 400–700 | SIL OFL 1.1 — `OFL-FrankRuhlLibre.txt` |
| David Libre | 400, 500 and 700 per subset | SIL OFL 1.1 — `OFL-DavidLibre.txt` |
| Heebo | one variable file per subset, 400–700 | SIL OFL 1.1 — `OFL-Heebo.txt` |

The SIL Open Font License allows a font to be bundled and served like this.
It asks that the licence travels with the files, which is what the three
`OFL-*.txt` files are for; they are not to be deleted.

The files themselves are Google Fonts' own subsetted woff2 builds, taken
unchanged. To refresh them, ask `fonts.googleapis.com/css2` for the family
with a modern browser's user agent, and download the `hebrew` and `latin`
URLs it names.
