# Data sources

ORIGIN's content bank is assembled from the American Numismatic Society's MANTIS collection at build time.

The checked-in dataset contains validated metadata and remote image URLs. `src/daily.generated.js` provides a stable shuffled schedule for daily play; practice mode draws from the same local bank. The game never queries MANTIS at runtime.

The importer samples twelve evenly spaced result pages across the complete result range of each coin department and scans every matching paper-money result. This gives broad chronological and collection coverage without sending more than a thousand bulk requests to exhaust all 123,000-plus coin records. `data/quality-report.json` records the upstream result count, examined count, hard rejections, eligible count, and post-validation curation separately.

## APIs

- MANTIS Atom search: `https://numismatics.org/search/feed/`
  - discovers approved physical objects with image, date, object type, and production-place filters
- MANTIS NUDS/XML API: `https://numismatics.org/search/apis/getNuds`
  - supplies dates, denominations, authorities, production-place identifiers, descriptions, rights, and matched obverse/reverse image groups
- Nomisma JSON-LD: `https://nomisma.org/id/{id}.jsonld`
  - resolves controlled mint identifiers to documented coordinates
- GeoNames RDF and Wikidata entity JSON
  - resolve linked production places that are not Nomisma mints

## Rights and attribution

- MANTIS metadata is available under the Open Database License.
- The importer admits only records whose NUDS image rights explicitly carry the Public Domain Mark.
- Every shipped object links to its stable ANS collection record and credits the American Numismatic Society.
- OpenStreetMap attribution remains visible on the map.

See the [ANS API documentation](https://numismatics.org/search/apis) and [photography permissions](https://numismatics.org/collections/photography-permissions/).
