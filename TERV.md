# Friend Speak Type – Terv

Beszédpótló (AAC) alkalmazás Android tabletre: a felhasználó begépel egy szöveget, a tablet hangosan kimondja.
A régi (már nem elérhető) PDA-s program funkcióit pótolja, illetve bővíti.

## 1. A felhasználó és ami ebből következik

- Nem tud beszélni, akaratlan mozdulatai vannak (túlmozgás), a kezét görcsösen tartja, kerekesszékben ül.
- **Szellemileg teljesen ép**, tud olvasni és írni. Ezért a felület szövegalapú, képekre nincs szükség. (A meglévő képes AAC-programokat, mint a Cboard vagy az AsTeRICS Grid, olyanoknak tervezték, akiknek az olvasással is gondjuk van, ezért itt nem megfelelőek.)
- A környezete nem ért a számítógéphez. A telepítésnek, beállításnak és frissítésnek egyszerűnek kell lennie.
- Internet nélkül is működnie kell, és sok évig, karbantartás nélkül.
- A kialakítás vegye figyelembe az írástanulást támogató használatot, a mozgásukban korlátozott és a gyengénlátó felhasználókat is.

## 2. Terjesztés és telepítés

### 2.1 Összehasonlítás

| Szempont | PWA (GitHub Pages) | Google Play | APK-fájl (USB-ről vagy letöltve) |
|---|---|---|---|
| Költség | ingyenes | egyszeri 25 USD a fejlesztői fiókért | ingyenes |
| Telepítés | egy link megnyitása, majd „Telepítés” gomb | Play Áruház, „Telepítés” | egyszer engedélyezni kell az „ismeretlen alkalmazások telepítését” (az Android felajánlja) |
| Kell-e hozzá internet | csak az első telepítéshez | csak a telepítéshez | **nem** |
| Közzététel nehézsége | kicsi | nagy: zárt teszt, legalább 12 tesztelővel 14 napig, személyazonosítás | kicsi |
| Hosszú távú megmaradás | amíg a tárhely él (áttehető máshová) | évente kötelező frissíteni a cél-API-szintet | a fájl örökre megőrizhető (USB, archive.org) |
| Frissítés | automatikus | automatikus | kézi |

### 2.2 Telepíthető-e a PWA USB-meghajtóról?

**Nem.** A PWA-telepítéshez és az offline működéshez (Service Worker) a böngésző `https://` címet követel meg. Fájlból (`file://`, USB) megnyitott oldalon:
- nincs „Alkalmazás telepítése” gomb;
- a Service Worker nem indul el, így az offline gyorsítótárazás sem működik;
- az Androidos Chrome eleve korlátozza a helyi HTML-fájlok megnyitását.

Szkriptes telepítés (`adb install` számítógépről) sem jó megoldás, mert ahhoz a tableten be kell kapcsolni a fejlesztői módot és az USB-hibakeresést. Ez nehezebb, mint egy APK-t telepíteni.

**USB-re (és archívumba) tehát nem a weboldalt, hanem a kész APK-fájlt kell tenni.** Az APK telepítése a fájlkezelőből: koppintás a fájlra, majd az Android megkérdezi, hogy engedélyezi-e a telepítést ebből a forrásból. A „Beállítások” gombbal egy kapcsolót kell átbillenteni, utána jön a „Telepítés”. Ezt egyszer kell megcsinálni, és egy segítő pár koppintással elvégzi.

> ⚠ A Google 2026-tól fokozatosan bevezeti, hogy a minősített Android-eszközökre csak ellenőrzött fejlesztők alkalmazásai települjenek, az áruházon kívüliek is. A bevezetés országonként eltérő ütemű, és lesz ingyenes, korlátozott eszközszámra szóló „hobbi” fiók is. Ezt kiadás előtt ellenőrizni kell. Ettől függetlenül a PWA-út érintetlen marad.

### 2.3 Döntés: egy kódbázis, kétféle csomag

Az alkalmazás **sima webes technológiával** (HTML, CSS, JavaScript) készül, és ugyanebből a kódból két kiadás lesz:

1. **PWA a GitHub Pages-en.** Ez a fő telepítési mód: egy link vagy QR-kód, és automatikus frissítés.
2. **Önálló APK (Capacitor-csomagolás) a GitHub Releases oldalon és USB-n.** Mindent tartalmaz, a hangmodellt is, internet nélkül telepíthető, és ez a hosszú távú tartalék.

A forrás és a kiadások tükrözve lesznek: GitHub, Codeberg és archive.org.

## 3. Beszédhang (TTS)

### 3.1 Cél
Jó minőségű, természetes magyar hang, **internet nélkül**, ingyen.

### 3.2 Lehetőségek

| Megoldás | Minőség | Offline | Megjegyzés |
|---|---|---|---|
| Android rendszerhang (Google beszédszolgáltatás) | közepes, eszközfüggő | igen, ha a magyar hang le van töltve | a hang típusa és minősége tabletenként eltér |
| **Piper (neurális, nyílt forrású)** | jó, természetes | **igen** | vannak magyar hangok (például `hu_HU-anna-medium`, `hu_HU-berta-medium`, `hu_HU-imre-medium`), modellenként kb. 60 MB, böngészőben WebAssembly/ONNX alatt fut |
| Felhőalapú hangok (Azure, Google Cloud) | kiváló | **nem** | internet és fizetés kell, ezért kizárt |
| eSpeak | gépies, robotszerű | igen | nem elég jó |

### 3.3 Döntés
- **Alapértelmezett hang:** Piper **`hu_HU-anna-medium`** (női hang, a hangminták alapján választva), az alkalmazásba csomagolva (a PWA-ban a gyorsítótárban, az APK-ban beépítve). A berta és az imre opcionális, letölthető vagy csomagolható hang.
- **Tartalék:** az Android rendszerhangja (Web Speech API), ha a Piper túl lassú az adott tableten.
- A hangok között a beállításokban lehet választani.
- **Sebesség:** a célkészülék, a Xiaomi Pad 6S Pro (Snapdragon 8 Gen 2) erős, ezért a késés várhatóan kicsi. Gyengébb jövőbeli tabletek miatt a gyakori mondatok hangja előre legenerálható és eltárolható, így azonnal szól. A tényleges tableten mérni kell (prototípus).
- **Licenc:** a magyar adatkészletek CC0 licencűek. Az anna és a berta hang egy angol alapmodellből lett továbbtanítva (Hi-Fi TTS, valószínűleg CC BY 4.0, vagyis feltüntetés szükséges), az imre egy CC0 licencű flamand alapmodellből. Mindhárom a Piper 1.5-ös vagy újabb verzióját igényli, ezt a böngészős futtatókörnyezetnél ellenőrizni kell.
- **Mért sebesség (asztali PC):** egy 12 másodperces szöveg kb. 0,5 másodperc alatt készül el. A tableten ennél lassabb lesz, ott külön mérni kell. A minták a `hangmintak/` mappában vannak.

### 3.4 Betűfelolvasás gépelés közben
Ha bekapcsolják, az app minden leütött betűt magyar betűnévvel mond ki („bé”, „cé”, „ef”, „hosszú í”, „ő” stb.). Ehhez egy saját betű–kiejtés táblázat kell, mert a TTS a magányos betűket gyakran rosszul ejti. A szóköznél opcionálisan a teljes utolsó szót is kimondja.

## 4. Szóajánló

### 4.1 Működés
- A billentyűzet fölötti sávban **3–5 nagy ajánlott szó** jelenik meg, egy érintéssel beilleszthető, a végére szóközt tesz.
- Az ajánlás figyelembe veszi:
  1. a már leütött betűket (előtag-egyezés);
  2. az előző egy-két szót (bigram/trigram, vagyis szókapcsolati statisztika);
  3. **a felhasználó saját szokásait**: amit gyakran ír, előrébb kerül, és új szavakat is megtanul.
- **Ékezetfüggetlen keresés:** az „e” betűre az „é”-s szavak is megjelennek („kerek” → „kérek”), így ritkábban kell az ékezetes sorba nyúlni.
- Szó elején, egyetlen betű leütése nélkül is ajánl: a mondat következő valószínű szavát.

### 4.2 Adatok
- **Alapszótár:** magyar szóalak-gyakorisági lista és kétszavas kapcsolatok egy nyílt licencű korpuszból (forrás és licenc kiválasztás előtt ellenőrizendő). Tömörítve néhány MB.
- **Saját tanulás:** a kimondott mondatokból szó- és szópár-számlálók épülnek, helyben tárolva. A saját szavak súlya nagyobb, mint az alapszótáré.
- Egy ajánlott szó a beállításokból törölhető vagy tiltható (például elírás esetén).

## 5. Kezelőfelület (a régi program alapján)

```
┌──────────────────────────────────────────────────────────┐
│  [ IGEN ]          [ ▼ mentett üzenetek ]        [ NEM ]  │
├──────┬────────────────────────────────────────┬──────────┤
│  ✕   │  beírt szöveg …                         │   🔊     │  ← a 🔊 bal/jobb oldalra tehető
├──────┴────────────────────────────────────────┴──────────┤
│  [ajánlott szó 1] [ajánlott szó 2] [ajánlott szó 3] …     │  ← új: szóajánló sáv
├──────────────────────────────────────────────────────────┤
│        á  é  í  ó  ö  ő  ú  ü  ű                           │
│   q  w  e  r  t  z  u  i  o  p   ⌫                         │
│     a  s  d  f  g  h  j  k  l   ↵                          │
│   ⇧  y  x  c  v  b  n  m  !,  ?.  ⇧                         │
│   123  [        szóköz        ]   ←   →                   │
└──────────────────────────────────────────────────────────┘
```

- Fekvő tájolás, teljes képernyő, a képernyő ébren marad.
- A **▼** gomb a mentett üzenetek (előre elkészített „kártyák”) listáját nyitja meg. Ezek szövegesek, kategóriákba rendezhetők, egy érintéssel kimondhatók és szerkeszthetők.
- A mentett üzenetek képernyőjének jobb felső sarkában van a ⚙ (beállítások).
- Az **IGEN** és a **NEM** mindig látható, és azonnal kimondja a szót.
- Előzmények: a korábban kimondott mondatok a mentett üzenetek mellett, egy külön fülön.
- **Gyakori mondatok (automatikus):** az app számolja, melyik teljes mondatot hányszor mondatta ki. A legtöbbször és legutóbb használtak egy „Gyakori” fülön, sorrendbe rendezve jelennek meg. Egy érintéssel véglegesen a mentett üzenetek közé tehetők. Így nem kell előre tudni a gyakori mondatait, az app megtanulja őket.
- **Kezdő készlet:** néhány általános mondat (köszönés, igen/nem/nem tudom, szükségletek, érzések, „Várj, írok…”, „Kérlek, ismételd meg!”), amit később ő vagy a férje szerkeszthet, illetve törölhet.

## 6. Követelmények – beállítások

A szövegek gépi felolvasását biztosító alkalmazásnak rendelkeznie kell olyan beállítási felülettel, amely lehetővé teszi a működés és a megjelenés felhasználói igényekhez történő igazítását.

### 6.1 A beállítások elérése és felhasználóválasztás
- A beállítások a mentett üzeneteket megjelenítő felületről, a jobb felső sarokban elhelyezett fogaskerék ikonnal érhetők el.
- ~~Többfelhasználós használat~~ – **nem szükséges** (egy felhasználó). Az 1. verzióban nincs felhasználóválasztás, de az adatszerkezet nem zárja ki, hogy később bekerüljön.
- A részletes beállítási felület a „Speciális beállítások” menüponton keresztül nyitható meg.

### 6.2 A beszédhang beállításai
- A hang kiválasztása (Piper-hangok, rendszerhang).
- A hangmagasság módosítása.
- A felolvasási sebesség szabályozása.
- A gépelés közbeni betűfelolvasás be- és kikapcsolása. Bekapcsolt állapotban a beírt betűket egyenként, magyarul ejti ki. Ez a teljes szöveg felolvasásától függetlenül használható.

### 6.3 Billentyűzet és szövegmegjelenítés
- A saját, nagy gombos billentyűzet és a készülék rendszerbillentyűzete között lehet választani.
- Csupa nagybetűs megjelenítés (külön kapcsoló).
- Diszlexiabarát betűtípus (külön kapcsoló). A betűtípus az alkalmazásba csomagolva érkezik, OFL-licenccel. **Ellenőrizni kell, hogy tartalmazza-e az ő és az ű betűt** (jelöltek: OpenDyslexic, Lexend, Atkinson Hyperlegible Next).
- Szóajánló be- és kikapcsolása, az ajánlott szavak száma (3–5).

### 6.4 Bal- és jobbkezes használat
A felolvasást indító 🔊 gomb a választás szerint a bal vagy a jobb oldalon jelenik meg. Ilyenkor a ✕ a másik oldalra kerül.

### 6.5 Érintéskezelés és késleltetett aktiválás
Választható módok: **normál**, **aktiválás felengedéskor**, **aktiválás hosszú lenyomásra**.

**Aktiválás felengedéskor:**
- a kijelző megérintésekor piros kör alakú érintésjelző jelenik meg;
- az ujját a kijelzőn tartva a kívánt gomb fölé csúsztathatja, a kijelölt gomb kiemelve látszik;
- az érintés és a csúsztatás önmagában nem indít műveletet;
- a program kizárólag az ujj felemelésekor aktiválja az akkor kijelölt gombot.

**Aktiválás hosszú lenyomásra:**
- csak akkor aktivál, ha az ujj a beállított ideig folyamatosan a gombon marad;
- a rövid érintés nem indít műveletet;
- a hátralévő időt egy töltődő körív vagy keret mutatja.

**Minden módban:**
- a többujjas, egyidejű érintések figyelmen kívül maradnak;
- ismétlésszűrés: ugyanaz a gomb a beállított időn belül nem aktiválható újra.

### 6.6 Kontrasztos megjelenítés
Bekapcsolható kontrasztos téma (például sárga betű fekete háttéren, vastag gombkeretek), amely a kezelőelemeket és a szövegeket jól elkülöníti.

### 6.7 A beállítások védelme
A beállítások opcionálisan zárolhatók. Bekapcsolt zár esetén a feloldás nélkül nem érhetők el.

### 6.8 Gyári beállítások visszaállítása
A beállítási menü alján egy külön gomb visszaállítja a beállításokat a gyári alapértékekre.

### 6.9 Mentés és visszatöltés
Az összes adat (felhasználók, beállítások, mentett üzenetek, tanult szavak) egyetlen fájlba exportálható és onnan visszatölthető. Ez tabletcserénél és a PWA–APK közti váltásnál is kell.

## 7. A pontosítandó részletek – javasolt döntések

| Kérdés | Javaslat (módosítható) |
|---|---|
| Hangmagasság | 0,5–2,0, lépésköz 0,1, alapérték 1,0 |
| Beszédsebesség | 0,5–2,0, lépésköz 0,1, alapérték 1,0 |
| Hosszú lenyomás ideje | állítható 200–3000 ms, lépésköz 100 ms, alapérték 800 ms |
| Ismétlésszűrés | állítható 0–2000 ms, alapérték 300 ms |
| Zár feloldása | **alapból kikapcsolva**, mert a felhasználó maga is kezeli a beállításokat. A beállítások ugyanazzal a nagy gombos, késleltetett érintéssel kezelhetők, mint a billentyűzet. Ha bekapcsolják: 4 jegyű PIN, amit a férje állít be. Elfelejtés esetén az adatok fájlba mentése után újratelepítéssel lehet visszaállni. |
| Tárolás | alkalmazásszinten (egy felhasználó): beállítások, mentett üzenetek, előzmények, tanult szavak, PIN |
| Gyári visszaállítás hatóköre | csak a **beállítások**. A mentett üzenetek és a tanult szavak megmaradnak. Ezek törlése külön, kétszeres megerősítést kérő gombbal történik. |

## 8. Technikai felépítés (az elkészült 0.1-es változat szerint)

```
/ (repo gyökér = GitHub Pages)
├── index.html
├── manifest.webmanifest
├── sw.js                    # Service Worker – offline
├── css/style.css
├── js/
│   ├── app.js               # indítás, képernyők, beállítások, gombkezelés
│   ├── touch.js             # érintésszűrés (normál / felengedéskor / hosszú lenyomás / ismétlésszűrés)
│   ├── keyboard.js          # saját billentyűzet kiosztás
│   ├── tts.js               # beszédmotor (Piper + rendszerhang tartalék, gyorsítótár)
│   ├── tts-worker.js        # Piper a háttérszálon (fonetizálás + ONNX)
│   ├── predict.js           # szóajánló
│   └── store.js             # helyi tárolás (localStorage), mentés/betöltés
├── data/                    # szólista (words-hu.txt), kezdő mondatok (phrases-hu.json)
├── fonts/                   # Lexend (OFL)
├── icons/
├── vendor/                  # ONNX Runtime Web, piper fonetizáló (WASM)
├── voices/                  # hu_HU-anna-medium (63 MB)
└── android/                 # (még nincs) Capacitor-projekt az APK-hoz
```

- Build-eszköz nélkül: sima HTML, CSS és JavaScript (ES modulok), hogy évek múlva is bárki módosítani tudja.
- Teljes méret: kb. 93 MB (a hangmodell 63 MB, az espeak-ng adatfájl 18 MB, az ONNX Runtime 10 MB). A csökkentés lehetséges (csak a magyar espeak-adat becsomagolásával), de nem sürgős.
- Tárolás: `localStorage` + `navigator.storage.persist()`. (Az adatmennyiség kicsi, az IndexedDB-re nincs szükség.)
- Az APK-t később GitHub Actions építi kiadáskor.

### Eltérések az eredeti tervtől
- **Betűtípus:** OpenDyslexic helyett **Lexend** (OFL), mert az OpenDyslexic csomagolt változata nem tartalmazza az ő és ű betűt.
- **Beállítások:** négy fülön (HANG, SZÖVEG, ÉRINTÉS, EGYÉB), a „Speciális beállítások” külön lépése nélkül, így nincs görgetés. A beállítások a mentett üzenetek képernyő jobb felső fogaskerekével érhetők el.
- **Nincs görgetés sehol:** minden lista lapozós (nagy ◀ ▶ gombokkal), mert a csúsztatásos kijelölés és a görgetés ütközne.
- **Ismétlésszűrés:** ugyanaz a gomb alapból 0,3 másodpercen belül nem aktiválható újra. Ez a PIN-kódban kétszer egymás után szereplő számjegyre is vonatkozik (lassabban kell megnyomni), de ez állítható.

## 9. Állapot és ütemterv

**Elkészült (0.1, böngészőben kipróbálva):**
- [x] Képernyő a régi program alapján: IGEN / NEM, mentett üzenetek, szövegmező, ✕ és 🔊 gomb (bal- vagy jobbkezes), billentyűzet, számok és jelek
- [x] Piper (anna) hang böngészőben, háttérszálon, internet nélkül (egy 12 mp-es szöveg ~0,5 mp alatt készül el asztali gépen)
- [x] Három érintési mód, piros érintésjelző, hosszú lenyomás folyamatjelzővel, ismétlésszűrés, többujjas érintés kiszűrése
- [x] Betűfelolvasás gépelés közben (előre legenerált betűhangok), hangmagasság és sebesség
- [x] Szóajánló: gyakorisági lista (30 000 szó), ékezetfüggetlen keresés, szópárok, tanulás a használatból
- [x] Mentett üzenetek, Gyakori és Előzmény fül; kimond, betölt, ment, töröl (megerősítéssel)
- [x] A szövegmező hosszú nyomására felugró menü: **Beillesztés** (vágólapról) és **Visszaállítás** (a legutóbb törölt vagy lecserélt szöveg; ismételve a két változat között vált)
- [x] **Hangerő** (50–300%, alapérték 150%): a rendszer hangerejétől független szoftveres erősítés. A hang automatikusan teljes kivezérlésre normalizált, a kimenet limiterrel és lágy vágóval védett (offline méréssel: nincs digitális vágás, a kimenet kb. 12 dB-lel hangosabb a 0.5-ös verziónál). Csak a Piper hangra hat; a rendszerhang hangereje nem emelhető a rendszer hangerején túl.
- [x] Beállítások (hang, szöveg, érintés, egyéb), kontrasztos téma, diszlexiabarát betű, nagybetűs megjelenítés
- [x] PIN-zár (opcionális), gyári visszaállítás, tanult adatok törlése, adatok mentése és betöltése fájlból
- [x] Offline működés (Service Worker), telepíthető webalkalmazás (manifest, ikonok); kipróbálva leállított szerverrel is

**Még hátra van:**
1. **Kipróbálás a tényleges tableten** (hang sebessége, gombméretek, a felengedéskor aktiváló mód a kacskán tartott kézzel). Ettől függően finomhangolás.
2. ~~GitHub-tárhely és GitHub Pages~~ **kész**: <https://github.com/prohi/friend-speak-type>, élő változat: <https://prohi.github.io/friend-speak-type/>. Hátra van az első telepítés a tabletre.
3. Vészhelyzet-gomb, kategóriák a mentett üzenetekben, szó- és szópár-statisztika szerkesztése (2. verzió).
4. APK (Capacitor) és tükrözés (Codeberg, archive.org), telepítési útmutató képekkel és QR-kóddal.
5. Az adatméret csökkentése (kisebb espeak-adatfájl), ha szükséges.
## 10. Nyitott kérdések

- [x] Tablet: **Xiaomi Pad 6S Pro** (12,4", HyperOS/Android). Később lehet újabb is, ezért a felület legyen képernyőméret-független. Xiaomi-sajátosságok: ellenőrizni kell, van-e rajta Chrome (a PWA-telepítéshez), és az appra ki kell kapcsolni az akkumulátor-optimalizálást.
- [x] Érintés: **ujjal**, kacskán tartott kézzel. A felengedéskor aktiváló mód és a nagy, hézagos gombok a fontosak, ezt a prototípussal ki kell próbálni.
- [x] Női vagy férfi hangot szeretne? → **anna** (női)
- [x] Gyakori mondatok: **nem ismertek**, ezért az app tanulja meg őket (5. pont: automatikus „Gyakori” fül). A szóajánló általános magyar gyakorisági listából indul, és a használattal tanul (4. pont).
- [x] Beállítások: **ő maga is** kezeli, a segítő a **férje**. A zár alapból kikapcsolva.
- [x] Több felhasználó: **nem kell**.