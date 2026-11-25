# Documentation

Put the capstone documentation here, following the template's sections.
Where to find the material for each section in this project:

| # | Template section | Source in the project |
|---|---|---|
| 1 | Project Overview | Main README (top) |
| 2 | Problem Statement | Your team's write-up |
| 3 | Objectives | Your team's write-up |
| 4 | Scope & Limitations | Main README → Notes; offline rules mode; sample KB data |
| 5 | Technologies | Main README → technology table |
| 6 | System Architecture | Main README → architecture diagram |
| 7 | Database Design | `backend/app/models.py` (ERD in the docstring) |
| 8 | UI Mockups | Screenshots of each page in `frontend/src/pages/` |
| 9 | AI Prompt Design | `backend/app/services/llm.py` (system prompt) + `services/tools.py` (tool schemas) |
| 10 | Workflow Automation | `backend/app/services/automation.py` + `automation/*.workflow.json` |
| 11 | Timeline | Your team's plan |
| 12 | Team Roles | Your team's plan |
| 13 | Testing | `backend/tests/` (pytest) + `backend/eval/results.json` |
| 14 | Deliverables | Working system, source code, README, slides, project brief |

API specification: run the backend and open http://localhost:8000/docs (export it from `/openapi.json`).
