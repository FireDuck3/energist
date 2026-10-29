"""Локальний dev-сервер без кешування: правки в JS/CSS видно одразу після перезавантаження.

Запуск: py tests/serve.py 8420   (з будь-якої папки — віддає корінь проєкту)
"""
import functools
import http.server
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8420
    handler = functools.partial(NoCacheHandler, directory=str(ROOT))
    with http.server.ThreadingHTTPServer(('127.0.0.1', port), handler) as server:
        print(f'WattWay: http://localhost:{port}/', flush=True)
        server.serve_forever()
