# NotionCronoTool

Eina personal de cronometratge d'hores d'estudi. Una pàgina al navegador amb un cronòmetre per blocs (iniciar, pausar, aturar) que desa cada sessió a una base de dades de Notion i mostra les hores previstes davant de les reals de cada setmana.

**L'especificació completa és a `SPEC.md`. Llegeix-la sencera abans de proposar res.**

## Qui soc i com m'has d'ajudar

- Soc l'usuari i responsable d'aquest projecte. És la primera vegada que faig servir Claude Code, i el meu nivell de programació, git i GitHub és **inicial total**.
- A cada pas que facis o em demanis, explica'm:
  1. **Què és i per què el fem**, en una o dues frases.
  2. **Un símil senzill** de la vida quotidiana perquè ho entengui ràpid (per exemple: «un commit és com desar una foto del projecte que pots recuperar»).
  3. **L'ordre exacta**, si n'hi ha, on l'he d'escriure i què n'he d'esperar veure.
- Respon sempre en **català**. El codi, els noms de variables, els comentaris i els missatges de commit, en **anglès**. Els textos que surten a la interfície de l'eina, en **català**.
- Si alguna cosa no està clara a `SPEC.md`, **pregunta'm abans de suposar**.
- Aquest projecte també és una peça del meu portafoli de gestió de projectes: valoro entendre les decisions, no només que funcioni.

## Entorn

- Windows. Carpeta del projecte: `D:\01_Projectes\Claude Projects\Claude Code Workspace\NotionCronoTool`. La ruta té espais: posa-la sempre entre cometes a les ordres.
- Python 3.15.2, amb un entorn virtual a `.venv`. Abans d'instal·lar una dependència, comprova que és compatible amb Python 3.15.
- Quan em donis ordres per a la terminal, digues-me si són per a PowerShell o per a Git Bash.
- Pla de Claude: Pro.

## Stack decidit

- **Servidor:** Python + Flask, només en local (`localhost`).
- **Interfície:** una sola pàgina HTML + CSS + JavaScript, sense frameworks, servida per Flask.
- **Notion:** API oficial de Notion. Fes servir la llibreria oficial `notion-client` si és compatible; si no, `requests`. La base de dades fa servir *data sources*: abans d'escriure les crides, comprova a la documentació oficial (developers.notion.com) quina versió de l'API cal i com s'adrecen els data sources.
- **Configuració del pla d'hores:** `config/plan.toml`, llegit amb `tomllib` (inclòs a Python, sense dependències).
- **Secrets i identificadors:** fitxer `.env`, carregat amb `python-dotenv`.

Si creus que alguna d'aquestes decisions no és bona, digues-m'ho i explica'm per què **abans** de canviar-la.

## Notion

- La base de dades **⏱ Sessions** és on l'eina escriu. Propietats (els noms han de coincidir exactament):
  - `Sessió` (títol) · `Bloc` (select) · `Franja` (data amb inici i final, amb hora) · `Pausa (min)` (número) · `Hores` (fórmula, **només lectura**) · `Tasca` (relació amb ✅ Tasques) · `Sensació` (select: Plaer, Neutre, Peatge) · `Nota` (text) · `Origen` (select: Manual, Eina).
  - L'eina sempre escriu `Origen` = `Eina`. Les files amb `Origen` = `Manual` les he creat a mà i també compten per a les hores reals.
- La base de dades **✅ Tasques** només es llegeix (propietats `Nom` i `Estat`).
- Els identificadors de les dues bases de dades són a `.env` (`NOTION_SESSIONS_DS_ID`, `NOTION_TASKS_DS_ID`). No els escriguis mai al codi ni als fitxers del repositori.
- **No creïs, esborris ni modifiquis** bases de dades ni propietats de Notion. L'eina només crea i actualitza files de ⏱ Sessions.

## Normes de treball

- **Pla abans de codi.** Treballem per les fases de `SPEC.md`, una a una. Abans de cada fase, proposa'm un pla curt i espera el meu «ok».
- **Final de cada fase:** explica'm com provar-ho a mà, pas a pas. Quan et confirmi que funciona, fes un commit petit amb un missatge clar.
- **Dependències:** demana'm permís abans d'instal·lar-ne cap, i explica'm per què cal.
- **Secrets:** no llegeixis, no mostris i no modifiquis mai el contingut de `.env`. El `.env` ha d'estar sempre al `.gitignore`. Mantén un `.env.example` amb els noms de les variables i sense valors.
- **Cost:** no facis servir mai claus d'API d'Anthropic ni la variable `ANTHROPIC_API_KEY`. Avisa'm abans de qualsevol cosa que pugui tenir cost: serveis externs, crèdits, allotjament.
- **Repositori públic:** cap dada personal al codi ni a l'historial (noms, tokens, identificadors de Notion). No facis `push` a GitHub si no t'ho demano.
- **Codi per a principiants:** funcions curtes, noms clars i comentaris on aportin. Prefereixo senzill i llegible a enginyós.
- **Límit de temps:** el projecte té un pressupost d'unes 6 h. Si una fase s'allarga, avisa'm i proposa'm què retallar.

## Ordres útils

- **Ús diari:** doble clic a `start.bat` (engega el servidor sense *debug* i obre el navegador; si ja està en marxa, només obre el navegador).

Per programar, totes per a **PowerShell**, des de la carpeta del projecte:

- Activar l'entorn virtual: `.\.venv\Scripts\Activate.ps1` (el prompt comença per `(.venv)`).
- Instal·lar dependències: `pip install -r requirements.txt`
- Arrencar el servidor: `python app.py` (Ctrl+C per aturar-lo).
- Obrir l'eina: <http://localhost:5000>

Notes: la ruta del projecte té espais, posa-la entre cometes. `notion-client` 3.1.0 fa servir l'API de Notion `2025-09-03` (data sources), definida a `notion_api.py`.

## Definició de fet (per a cada fase)

- Supera la prova manual descrita a la fase.
- No hi ha errors a la terminal ni a la consola del navegador.
- El `README.md` està al dia si la fase hi afecta.
- Hi ha un commit amb la fase.
