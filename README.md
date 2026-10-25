# North Korea's sanctions-evasion network

An interactive investigation of North Korea's sanctions-evasion network, built on RAND's coding of UN Panel of Experts reports (2010–2022) with C4ADS Sanctions Explorer data. Live at https://dprk-sanctions.vercel.app.

- **Story:** a scrolling walk through the main findings, with the globe changing at each step.
- **Explorer:** three views of the same data (Globe, Countries, Targets) that share one filter bar and a details panel. Every view can be shared as a link.

## Files

| Path | What it is |
| --- | --- |
| `index.html` | Page structure |
| `css/style.css` | Styles |
| `js/app.js` | Story, explorer, filters, views |
| `data/data.js` | The dataset: actors, links, countries, map shapes |
| `data/metrics.js` | Generated network metrics (links per actor, broker rank) |
| `scripts/build-metrics.js` | Rebuilds `data/metrics.js` from `data/data.js` |
| `js/vendor/` | globe.gl 2.34.4 and topojson-client 3.1.0 |

## Running locally

It's a static site with no build step:

```bash
python3 -m http.server 8765
```

After changing `data/data.js`, rebuild the metrics:

```bash
node scripts/build-metrics.js
```

## Broker rank

Broker rank is betweenness centrality: how often an actor lies on the shortest path between two other actors, over the actor-to-actor links. It's our own measure, unweighted, and not RAND's weighted subgroup betweenness.
