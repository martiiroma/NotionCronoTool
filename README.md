# NotionCronoTool

Eina personal per cronometrar hores d'estudi per blocs i desar-les a Notion.
*(En construcció: aquest README s'ampliarà a la fase 5.)*

## Instal·lació (PowerShell)

```powershell
cd "D:\01_Projectes\Claude Projects\Claude Code Workspace\NotionCronoTool"
py -3.15 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env   # i omple els valors
```

## Arrencar

```powershell
.\.venv\Scripts\Activate.ps1
python app.py
```

Obre <http://localhost:5000> al navegador.
