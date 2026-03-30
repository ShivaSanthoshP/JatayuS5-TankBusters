# How to Run ITOps Orchestrator

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Python | 3.9+ | `brew install python` (macOS) / `apt install python3` (Linux) |
| Node.js | 18+ | `brew install node` (macOS) / `apt install nodejs npm` (Linux) |
| Ollama | latest | [ollama.com](https://ollama.com) |

## Quick Start (Automated)

We provide one-command launchers that handle virtual environment creation, dependency installation, and service startup automatically.

1. **Start Ollama and pull the required models:**
   ```bash
   ollama serve
   ollama pull gemma3:4b
   ollama pull nomic-embed-text
   ```

2. **Run the launcher for your OS:**

   | OS | Command |
   |----|---------|
   | **macOS** | `chmod +x quickruns/run-macos.sh && ./quickruns/run-macos.sh` |
   | **Linux** | `chmod +x quickruns/run-linux.sh && ./quickruns/run-linux.sh` |
   | **Windows** | `quickruns\run.bat` |

3. **Open the platform:**
   - **Web Interface:** http://localhost:3000
   - **API Docs:** http://localhost:8000/docs

4. **Stop the platform:**
   - Press `Ctrl+C` in the terminal(s).

---

## Manual Startup (If scripts fail)

If you prefer to run the services manually in separate terminals:

### 1. Start the Backend
```bash
cd backend
python3 -m venv venv
source venv/bin/activate          # On Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env              # Edit OLLAMA_MODEL etc. if needed
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 2. Start the Frontend (New Terminal window)
```bash
cd frontend
npm install
npm run dev
```

### 3. Access the Platform
Navigate to http://localhost:3000 in your browser.
