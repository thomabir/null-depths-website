"""Development server for the website. It disables browser caching, so a reload always shows the current files."""

import argparse
import functools
import http.server
from pathlib import Path


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()
    handler = functools.partial(NoCacheHandler, directory=str(Path(__file__).parent))
    with http.server.ThreadingHTTPServer(("localhost", args.port), handler) as server:
        print(f"Serving on http://localhost:{args.port}/")
        server.serve_forever()


if __name__ == "__main__":
    main()
