# Null Depth History

Static website with an interactive plot of the best achieved raw null depth of nulling interferometers as a function of wavelength.

## Files

- `index.html`, `style.css`, `app.js`: the website.
- `data/null-depths.yaml`: all data. The comment at the top of the file defines the fields.
- `fonts/PlotSans-Regular.ttf`: font for the PDF export. See `fonts/README.md`.

## Export

The toolbar above the plot downloads the current view as PDF, SVG or PNG. The export always uses the light colour palette. The PDF is vector graphics with the font embedded.

## Run locally

The page loads the data with `fetch`, so it needs an HTTP server. `serve.py` is an HTTP server that disables browser caching:

```sh
python3 serve.py
```

Then open <http://localhost:8000/>.

## Add a result

Add an entry under `results:` in `data/null-depths.yaml`. For an internal lab milestone without a publication, set `status: unpublished`. The page checks each entry when it loads and shows an error message for a field with an incorrect value.

## Libraries

- [Plotly.js](https://plotly.com/javascript/) 2.35.2: plot.
- [js-yaml](https://github.com/nodeca/js-yaml) 4.1.0: YAML parser.
- [jsPDF](https://github.com/parallax/jsPDF) 2.5.1 and [svg2pdf.js](https://github.com/yWorks/svg2pdf.js) 2.2.3: PDF export.
