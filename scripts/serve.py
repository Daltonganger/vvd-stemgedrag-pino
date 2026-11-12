#!/usr/bin/env python3
"""Lokale ontwikkelserver met ruimte voor parallelle script- en kaartrequests."""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from common import SOURCE_ROOT


class LocalServer(ThreadingHTTPServer):
    request_queue_size = 128


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=8765)
    args = parser.parse_args()
    handler = partial(SimpleHTTPRequestHandler, directory=str(SOURCE_ROOT))
    with LocalServer(('127.0.0.1', args.port), handler) as server:
        print(f'http://127.0.0.1:{args.port}', flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
