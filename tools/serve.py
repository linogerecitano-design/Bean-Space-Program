import http.server, sys, os, base64
SNAP_DIR = os.environ.get('BSP_SNAP_DIR', os.path.join(os.path.dirname(__file__), '..', '.snaps'))
class H(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, '.js': 'text/javascript', '.mjs': 'text/javascript', '.glb': 'model/gltf-binary', '.json': 'application/json'}
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store'); super().end_headers()
    def log_message(self, *a): pass
    # dev only: POST /__snap?name=foo with a data: URL body saves .snaps/foo.jpg
    def do_POST(self):
        if not self.path.startswith('/__snap'):
            self.send_error(404); return
        name = ''.join(c for c in (self.path.split('name=')[-1] if 'name=' in self.path else 'snap') if c.isalnum() or c in '-_')[:40] or 'snap'
        body = self.rfile.read(int(self.headers.get('Content-Length', 0))).decode()
        data = base64.b64decode(body.split(',', 1)[1])
        os.makedirs(SNAP_DIR, exist_ok=True)
        with open(os.path.join(SNAP_DIR, name + '.jpg'), 'wb') as f: f.write(data)
        self.send_response(200); self.end_headers(); self.wfile.write(b'ok')
port = int(sys.argv[1]) if len(sys.argv) > 1 else 8123
http.server.ThreadingHTTPServer(('', port), H).serve_forever()
