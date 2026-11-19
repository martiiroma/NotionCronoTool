# SPEC — NotionCronoTool v1

*Versió 1.0 · 17/11/2026 · Responsable: autor del repositori*

## 1. Problema i objectiu

Segueixo un pla d'estudi amb hores previstes per bloc (PM, Python, SQL...). Sense un registre, la revisió del pla es fa de memòria i no és fiable.

**Objectiu:** registrar amb un clic el temps real que dedico a cada bloc, desar-lo a Notion i veure cada setmana les hores previstes davant de les reals.

**Criteris d'èxit del projecte**
- La v1 funciona el diumenge 22/11/2026.
- Registra totes les sessions de la setmana del 23/11.
- La construcció no passa de ~6 h de dedicació.

## 2. Usuari i context

- Un sol usuari (jo), a un sol ordinador Windows, amb l'eina oberta en una pestanya del navegador.
- Treballo en blocs d'1,5 a 3 h. Algunes sessions les registro a mà a Notion; l'eina ha de conviure amb aquestes files.

## 3. Abast

**Dins de la v1**
- Cronòmetre amb iniciar, pausar, reprendre i aturar.
- Límit automàtic de 3 h de temps actiu per sessió.
- Desar cada sessió a ⏱ Sessions, amb sensació i nota opcionals.
- Vincular una tasca de ✅ Tasques (opcional).
- Vista setmanal de previst davant de real.
- Arrencada amb un doble clic.

**Fora de la v1**
- Mòbil o altres dispositius.
- Editar o esborrar sessions des de l'eina (es fa directament a Notion).
- Diversos usuaris, inici de sessió, desplegament a internet.
- Estadístiques avançades o gràfics.

## 4. Històries d'usuari i criteris d'acceptació

### HU1 — Iniciar una sessió
*Com a estudiant, vull triar un bloc i prémer «Inicia» per registrar el temps sense haver-hi de pensar.*
- [ ] Hi ha un selector amb els 10 blocs, amb els mateixos noms que a Notion: PM, Python, SQL i bases de dades, Excel/Power BI online, Exercici de comandes, Portafoli, Cerca de feina, Tancament setmanal, Formació presencial, IT Academy.
- [ ] Hi ha un camp opcional per descriure la sessió. Si queda buit, el títol de la fila és el nom del bloc.
- [ ] «Inicia» està desactivat fins que hi ha un bloc triat.
- [ ] En iniciar, el cronòmetre mostra el temps actiu en format hh:mm:ss.
- [ ] En iniciar, es crea una fila a ⏱ Sessions amb `Sessió`, `Bloc`, inici de `Franja` i `Origen` = Eina.
- [ ] Només hi pot haver una sessió activa alhora.

### HU2 — Pausar i reprendre
*Com a estudiant, vull poder pausar el cronòmetre si m'interrompen, sense tancar la sessió.*
- [ ] Amb una sessió activa, hi ha un botó «Pausa». En pausa, es converteix en «Reprèn».
- [ ] En pausa, el cronòmetre s'atura i la pantalla ho indica clarament.
- [ ] Hi pot haver diverses pauses dins la mateixa sessió.
- [ ] En aturar, el total de minuts en pausa es desa a `Pausa (min)`.

### HU3 — Aturar i valorar la sessió
*Com a estudiant, vull aturar la sessió i, si vull, anotar com m'ha anat amb un sol clic.*
- [ ] En aturar, s'escriu el final de `Franja` i `Pausa (min)` a la fila de Notion.
- [ ] Després d'aturar, apareixen tres botons (Plaer, Neutre, Peatge), un camp de nota opcional i l'opció «Ometre».
- [ ] Un sol clic en una sensació la desa. La nota és opcional.
- [ ] Les `Hores` que calcula Notion coincideixen amb el temps actiu del cronòmetre (marge d'1 minut).

### HU4 — Límit de 3 hores
*Com a estudiant, vull que la sessió s'aturi sola a les 3 h, per si me n'oblido i per recordar-me que he de descansar.*
- [ ] Quan el temps actiu arriba a 3:00:00, la sessió s'atura i es desa sola, com a HU3.
- [ ] El temps en pausa no compta per al límit.
- [ ] Apareix un missatge visible amb to amè, que m'anima a descansar i continuar més tard o l'endemà. El text és provisional i es pot canviar a `config/plan.toml`.
- [ ] Si la pestanya no és visible, surt també una notificació del navegador (si he donat permís).

### HU5 — No perdre cap sessió
*Com a estudiant, no vull perdre una sessió per haver tancat la pestanya o perquè Notion falli.*
- [ ] Si tanco o recarrego la pestanya amb una sessió activa o en pausa, en tornar-la a obrir la sessió continua amb el temps correcte.
- [ ] Si Notion no respon en iniciar o aturar, la sessió es guarda en un fitxer local i es torna a enviar automàticament quan Notion respon.
- [ ] Els errors es mostren en català i amb llenguatge clar (sense codis tècnics).

### HU6 — Vincular una tasca
*Com a estudiant, vull vincular, si cal, la sessió a una tasca de Notion.*
- [ ] Un selector opcional amb cerca per nom mostra les tasques de ✅ Tasques que no estan en estat Fet, Done ni Arxivat.
- [ ] Triar una tasca és opcional: puc iniciar la sessió sense tasca.
- [ ] Si en trio una, l'eina l'assigna sola a la relació `Tasca` de la fila, sense que hagi d'anar a Notion.

### HU7 — Previst davant de real
*Com a estudiant, vull veure cada setmana si arribo a les hores previstes.*
- [ ] Una vista mostra la setmana actual (de dilluns a diumenge) amb una fila per bloc: hores previstes, hores reals i diferència.
- [ ] Les hores reals inclouen totes les files de ⏱ Sessions de la setmana, tant `Manual` com `Eina`.
- [ ] Les hores previstes surten de `config/plan.toml`, segons el tipus de setmana.
- [ ] Hi ha dos totals amb el terra marcat: **PM** (terra 10 h) i **Dades** (terra 8 h). Dades = Python + SQL i bases de dades + Excel/Power BI online + Exercici de comandes + IT Academy + Formació presencial.
- [ ] Puc anar a la setmana anterior i a la següent.

### HU8 — Arrencar fàcil
*Com a estudiant, vull obrir l'eina sense haver d'escriure ordres.*
- [ ] Un doble clic a `start.bat` engega el servidor i obre la pàgina al navegador.
- [ ] El `README.md` explica com instal·lar-la i fer-la servir, pensat per a algú que no programa.

## 5. Model de dades a Notion

**⏱ Sessions** (l'eina hi escriu)

| Propietat | Tipus | Qui l'omple |
|---|---|---|
| Sessió | Títol | Eina (descripció o nom del bloc) |
| Bloc | Select (10 opcions) | Eina |
| Franja | Data amb inici i final, amb hora | Eina |
| Pausa (min) | Número | Eina |
| Hores | Fórmula: (franja − pausa) / 60 | Notion, només lectura |
| Tasca | Relació amb ✅ Tasques | Eina: hi escriu la tasca que l'usuari tria al selector. Triar-ne una és opcional per a l'usuari; si no en tria cap, queda buida |
| Sensació | Select: Plaer, Neutre, Peatge | Eina, opcional |
| Nota | Text | Eina, opcional |
| Origen | Select: Manual, Eina | Eina (sempre «Eina») |

**✅ Tasques** (només lectura): `Nom` (títol), `Estat` (status).

**Variables de `.env`:** `NOTION_TOKEN`, `NOTION_SESSIONS_DS_ID`, `NOTION_TASKS_DS_ID`.

## 6. Configuració: `config/plan.toml`

Conté el missatge del límit de 3 h, els grups (PM, Dades), els terres i les hores previstes per tipus de setmana.

> Les hores reals de cada usuari són al seu `config/plan.toml`, que **no es publica** (és a `.gitignore`). Al repositori hi ha `config/plan.example.toml`, amb la mateixa estructura i valors d'exemple com aquests:

| Bloc | Setmana tipus | Setmana especial (exemple) |
|---|---|---|
| PM | 10 | 8 |
| Python | 4 | 2 |
| SQL i bases de dades | 3 | 2 |
| Excel/Power BI online | 2 | 1 |
| Exercici de comandes | 1 | 1 |
| Formació presencial | 0 | 10 |
| Portafoli | 2 | 1 |
| Cerca de feina | 1 | 1 |
| Tancament setmanal | 0,5 | 1 |
| IT Academy | 0 | 0 |

- Qualsevol setmana sense tipus assignat fa servir la «setmana tipus».
- Les setmanes especials s'assignen per data d'inici (dilluns) al fitxer.

## 7. Fases

| Fase | Contingut | Històries | Prova manual (resum) |
|---|---|---|---|
| 0. Preparació | Entorn virtual, git, `.gitignore`, `.env.example`, integració de Notion (guiada pas a pas), prova de connexió que llegeix el nom de ⏱ Sessions | — | El servidor arrenca i mostra «Connectat a ⏱ Sessions» |
| 1. Cronòmetre local | Selector de bloc, iniciar, pausar, reprendre, aturar, límit de 3 h; sense Notion encara | HU1 (part local), HU2, HU4 | Una sessió curta amb una pausa; límit provat amb un temps reduït de prova |
| 2. Desar a Notion | Crear i tancar la fila, sensació i nota, recuperació en recarregar, cua local si Notion falla | HU1, HU3, HU5 | La fila apareix a Notion amb les Hores correctes; recarregar a mitja sessió no la perd |
| 3. Tasques | Selector de tasques amb cerca | HU6 | La sessió queda vinculada a la tasca triada |
| 4. Previst davant de real | Lectura de la setmana i de `plan.toml`, taula i totals | HU7 | Els totals coincideixen amb la vista «Per bloc» de Notion |
| 5. Tancament | `start.bat`, `README.md` per al portafoli, captura de pantalla | HU8 | Obrir l'eina amb doble clic des de zero |

## 8. Supòsits (revisar si algun no és correcte)

1. El temps actiu exclou les pauses; el límit de 3 h compta només el temps actiu.
2. Una pausa no té límit de durada. La sessió s'acaba quan l'aturo o quan arriba a les 3 h actives.
3. La setmana va de dilluns a diumenge; les sessions de diumenge compten per a aquella setmana.
4. La notificació del navegador demana permís la primera vegada; si dic que no, només surt el missatge a la pàgina.
5. El missatge del límit de 3 h és provisional fins que en definim el to.
6. Per provar el límit de 3 h a la fase 1, es pot reduir temporalment a la configuració (per exemple, a 1 minut).
