# Data sources

ORIGIN's content bank is assembled from public Wikimedia APIs at build time.

## APIs

- English Wikipedia Action API: `https://en.wikipedia.org/w/api.php`
  - `prop=pageimages` for the selected free lead image
  - `prop=extracts` for the introductory factual sentence
  - `prop=info&inprop=url` for the canonical article URL
- Wikimedia Commons Action API: `https://commons.wikimedia.org/w/api.php`
  - `prop=imageinfo`
  - `iiprop=url|mime|size|canonicaltitle|extmetadata`
  - author, credit, license, license URL, and source file page are retained per record
- Wikidata Query Service: `https://query.wikidata.org/sparql`
  - `scripts/discover.sparql` discovers coin and banknote items with images, countries, coordinates, and English Wikipedia sitelinks

## Rights and attribution

- Wikidata structured data is CC0.
- Wikipedia text is CC BY-SA.
- Wikimedia Commons files have individual licenses. The build never applies one global license to all images.
- The game result view links to the Wikipedia article and displays the Commons author and license linked to the file page.
- OpenStreetMap attribution remains visible on the map.

See Wikimedia's [reuse guidance](https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia) before redistributing or caching any image locally.
