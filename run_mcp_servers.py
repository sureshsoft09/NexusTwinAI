"""Runner script for launching all 3 NexusTwin AI FastMCP servers concurrently.

Microservices:
  1. erp_inventory_mcp       (Port 8081) -> SAP S/4HANA Inventory & ATP
  2. logistics_rates_mcp      (Port 8082) -> Multi-carrier Freight Rates & Transit SLAs
  3. bigquery_telemetry_mcp   (Port 8083) -> Scanner Velocity Telemetry & Lakehouse Audit
"""

import os
import signal
import subprocess
import sys
import time
from pathlib import Path

root_dir = Path(__file__).resolve().parent

MCP_SERVERS = [
    {
        "name": "erp_inventory_mcp (Port 8081)",
        "cmd": [sys.executable, str(root_dir / "mcp-servers" / "erp_inventory_mcp" / "main.py")],
        "port": 8081,
    },
    {
        "name": "logistics_rates_mcp (Port 8082)",
        "cmd": [sys.executable, str(root_dir / "mcp-servers" / "logistics_rates_mcp" / "main.py")],
        "port": 8082,
    },
    {
        "name": "bigquery_telemetry_mcp (Port 8083)",
        "cmd": [sys.executable, str(root_dir / "mcp-servers" / "bigquery_telemetry_mcp" / "main.py")],
        "port": 8083,
    },
]


def main():
    print("=" * 70)
    print("Launching NexusTwin AI FastMCP Servers (Streamable HTTP at /mcp)")
    print("=" * 70)

    processes = []
    env = os.environ.copy()
    env["PYTHONPATH"] = f"{root_dir}{os.pathsep}{root_dir / 'agents' / 'src'}"

    try:
        for s in MCP_SERVERS:
            print(f"[STARTING] {s['name']}...")
            p = subprocess.Popen(s["cmd"], env=env)
            processes.append((s["name"], p))
            time.sleep(0.5)

        print("\nAll 3 FastMCP Servers are active and listening:")
        print("  - ERP Inventory MCP       : http://127.0.0.1:8081/mcp")
        print("  - Logistics Rates MCP     : http://127.0.0.1:8082/mcp")
        print("  - BigQuery Telemetry MCP  : http://127.0.0.1:8083/mcp")
        print("\nPress Ctrl+C to terminate all servers.\n")

        while True:
            time.sleep(1)

    except KeyboardInterrupt:
        print("\nShutting down all FastMCP servers...")
        for name, p in processes:
            p.terminate()
        for name, p in processes:
            p.wait()
        print("All FastMCP servers stopped.")


if __name__ == "__main__":
    main()
