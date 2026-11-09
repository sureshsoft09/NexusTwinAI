"""Application Orchestrator for NexusTwin AI (Backend Port 8080 + RemoteA2aAgent Port 8001).

Connects to:
  - Deployed Vertex AI Agent Engine : projects/311231946335/locations/us-central1/reasoningEngines/6418419193229606912
  - Deployed Cloud Run MCP Servers  :
      * https://erp-inventory-mcp-zjhvvbsjwa-uc.a.run.app/mcp
      * https://logistics-rates-mcp-zjhvvbsjwa-uc.a.run.app/mcp
      * https://bigquery-telemetry-mcp-zjhvvbsjwa-uc.a.run.app/mcp
  - Remote A2A HITL Server          : http://localhost:8001/a2a/human_in_loop
  - FastAPI Agent Bridge Backend    : http://localhost:8080
"""

import os
import subprocess
import sys
import time
from pathlib import Path

root_dir = Path(__file__).resolve().parent

SERVICES = [
    {
        "name": "a2a-human-in-loop (Port 8001)",
        "cmd": [sys.executable, str(root_dir / "run_a2a_server.py")],
        "cwd": root_dir,
    },
    {
        "name": "nexustwin-backend (Port 8080)",
        "cmd": [
            sys.executable,
            "-m",
            "uvicorn",
            "backend.app.main:app",
            "--host",
            "0.0.0.0",
            "--port",
            "8080",
            "--reload",
        ],
        "cwd": root_dir,
    },
]


def main():
    print("=" * 78)
    print("NexusTwin AI — Backend (:8080) + RemoteA2aAgent (:8001) Launcher")
    print("Vertex AI Agent Engine: projects/311231946335/locations/us-central1/reasoningEngines/6418419193229606912")
    print("=" * 78)

    processes = []
    env = os.environ.copy()
    env["PYTHONPATH"] = f"{root_dir}{os.pathsep}{root_dir / 'agents' / 'src'}{os.pathsep}{root_dir / 'shared'}"

    try:
        for svc in SERVICES:
            print(f"[BOOT] Starting {svc['name']}...")
            p = subprocess.Popen(svc["cmd"], cwd=svc["cwd"], env=env)
            processes.append((svc["name"], p))
            time.sleep(1.0)

        print("\n" + "=" * 78)
        print("NexusTwin AI Backend & A2A Services Running:")
        print("  - Backend Swagger Docs  : http://localhost:8080/docs")
        print("  - Health / Twin State   : http://localhost:8080/api/v1/twin/state")
        print("  - WebSocket Telemetry   : ws://localhost:8080/api/v1/twin/ws/telemetry")
        print("  - Remote A2A Agent Card : http://localhost:8001/a2a/human_in_loop/.well-known/agent.json")
        print("  - Cloud Run ERP MCP     : https://erp-inventory-mcp-zjhvvbsjwa-uc.a.run.app/mcp")
        print("  - Cloud Run Rates MCP   : https://logistics-rates-mcp-zjhvvbsjwa-uc.a.run.app/mcp")
        print("  - Cloud Run BQ MCP      : https://bigquery-telemetry-mcp-zjhvvbsjwa-uc.a.run.app/mcp")
        print("=" * 78)
        print("\nTo start the React Control Tower UI (Port 3000), open another terminal:")
        print("  cd Prototype/src/frontend")
        print("  npm run dev\n")
        print("Press Ctrl+C to stop all services.\n")

        while True:
            time.sleep(1)

    except KeyboardInterrupt:
        print("\nShutting down NexusTwin AI services...")
        for _, p in processes:
            p.terminate()
        for _, p in processes:
            p.wait()
        print("All services terminated cleanly.")


if __name__ == "__main__":
    main()
