# Optional Tier 1: n8n Visual Automation Workflows (Enterprise Extension)

This directory contains turnkey n8n workflow pipeline definitions for **NexusTwin AI**.

> [!NOTE]
> **Optional Component:** The core NexusTwin AI system (FastAPI Agent Bridge + Google ADK Swarm + FastMCP Microservices + React Control Tower) runs **100% standalone** without n8n. These workflows serve as an enterprise iPaaS add-on for perimeter DMZ buffering and Slack Block Kit interactive card dispatch.

---

## Workflows Included

| File | Name | Description | Trigger |
| :--- | :--- | :--- | :--- |
| `pos_anomaly_pipeline.json` | **POS Anomaly Ingestion** | Ingests real-time POS velocity streams from retail checkout scanners, evaluates anomaly thresholds ($>1.5\times$ velocity or critical stock), and forwards events to the ADK Agent Bridge. | Webhook `POST /pos-anomaly-webhook` |
| `replenishment_pipeline.json` | **Autonomous Replenishment Scheduler** | Queries the Digital Twin State periodically, identifies high-risk stores ($<24\text{h}$ to stockout), and triggers multi-agent replenishment runs. | Scheduled Cron (Every 15 min) |
| `hitl_approval_pipeline.json` | **HITL Governance & Slack Cards** | Formats and posts rich Slack Block Kit cards for human director sign-off on high-impact replenishment decisions. | Webhook `POST /hitl-approval-request` |

---

## Import Instructions

1. **Launch n8n:**
   - Deployed on Cloud Run or running locally on `http://localhost:5678`.
2. **Import Workflow:**
   - Open your n8n workspace.
   - Click **Workflows** $\rightarrow$ **Add Workflow** $\rightarrow$ **Import from File...**
   - Select the respective `.json` file from this folder.
3. **Configure Environment Variables in n8n:**
   Set the following environment variables in n8n (or Cloud Run environment settings):
   - `AGENT_BRIDGE_URL`: Base URL of the Agent Bridge (e.g. `http://localhost:8080` or `https://agent-bridge-xyz-uc.a.run.app`).
   - `SLACK_WEBHOOK_URL`: *(Optional)* Incoming Slack Webhook URL for `#supply-chain-approvals` channel notifications.
4. **Activate Workflows:**
   - Toggle the **Active** switch in the top-right corner of each imported workflow to enable live webhook listening.
