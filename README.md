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

## Com funciona una sessió

1. Tria un bloc, escriu una nota inicial si vols i prem **Inicia**.
2. Pausa i reprèn tantes vegades com calgui. Amb **Afegeix a la nota** pots completar la nota.
3. Prem **Atura**: s'obre un resum on pots triar la sensació i la tasca de ✅ Tasques (opcionals, amb cerca per nom) i retocar la nota.
4. **Envia a Notion** crea la fila a ⏱ Sessions. **Cancel·la** la deixa pendent (botó «Revisa i envia»). **Descarta** la llença.

**No es perd res:** la sessió es desa al navegador, així que pots recarregar o tancar la pestanya i en tornar continua on era (fes servir sempre el mateix navegador). Si Notion no respon en enviar, la sessió es guarda a `data/queue.json` i s'envia sola quan Notion torna.

L'eina comprova en arrencar que ⏱ Sessions té les propietats i les opcions esperades. Si no, no hi escriu res i ho avisa al peu de la pàgina.

## Personalitzar

Tots els ajustos són a `config/plan.toml` (títol, blocs, límit de temps, missatge). Els canvis s'apliquen en recarregar la pàgina.

**Vídeo de fons (opcional):** posa un vídeo `.mp4` a `static/media/` (per exemple, un de llicència lliure de [Pexels](https://www.pexels.com/)) i escriu-ne el nom a `background_video`. Millor en 1080p: el 4K pesa molt i fa treballar més l'ordinador. Els vídeos no es pugen al repositori. Sense vídeo, es mostra un degradat.
