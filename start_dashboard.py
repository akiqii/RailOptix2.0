"""
RailOptix - One-Click Launcher
Starts the FastAPI Backend Server & Serves the Interactive Control Room Dashboard
"""
import sys
import os
import socket

# Add root directory to sys.path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

def find_available_port(preferred_port=8080):
    for port in [preferred_port, 8081, 8082, 8500, 8000]:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            if s.connect_ex(('127.0.0.1', port)) != 0:
                return port
    return preferred_port

if __name__ == "__main__":
    import uvicorn
    import threading
    import webbrowser
    import time
    from trackpulse.server import app

    port = int(os.environ.get("PORT", find_available_port(8080)))

    def open_browser():
        time.sleep(1.2)
        try:
            webbrowser.open(f"http://127.0.0.1:{port}")
        except Exception:
            pass

    if os.environ.get("NO_BROWSER", "0") != "1":
        threading.Thread(target=open_browser, daemon=True).start()

    print("=" * 68)
    print("  🚀 RAILOPTIX — LTA RAILWAY TRACK ACCESS SCHEDULING DASHBOARD")
    print(f"  Live at: http://127.0.0.1:{port}")
    print(f"  API Docs: http://127.0.0.1:{port}/docs")
    print("=" * 68)
    uvicorn.run(app, host="127.0.0.1", port=port)

