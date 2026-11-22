# Friend Speak Type

Beszédpótló (AAC) webalkalmazás Androidra: a beírt szöveget hangosan kimondja. Internet nélkül is működik, telepíthető (PWA). A terv a [TERV.md](TERV.md) fájlban van.

## Kipróbálás a számítógépen

Kell hozzá Python (vagy bármilyen statikus webszerver). A projekt mappájában:

```
python -m http.server 8080
```

Ezután a böngészőben: <http://localhost:8080>

A `localhost` címen a Service Worker (offline gyorsítótár) alapból ki van kapcsolva, hogy a módosítások azonnal látszódjanak. Kipróbálásához: <http://localhost:8080/?sw>

## Kipróbálás a tableten (ugyanazon a Wi-Fi-n)

1. A számítógépen: `python -m http.server 8080 --bind 0.0.0.0`
2. A tableten a böngészőben: `http://<a számítógép IP-címe>:8080`
3. A Windows tűzfal engedélyét meg kell adni, ha rákérdez.

Ez csak próbára jó. Az offline működéshez és a telepítéshez HTTPS cím kell (például GitHub Pages).

## Fájlok

Lásd a [TERV.md](TERV.md) 8. pontját.

## Külső összetevők

| Összetevő | Licenc |
|---|---|
| [Piper](https://github.com/rhasspy/piper) magyar hangok (`hu_HU-anna-medium`), [hangmodellek](https://huggingface.co/rhasspy/piper-voices) | az adatkészlet CC0; az anna és a berta egy Hi-Fi TTS alapmodellből lett továbbtanítva (feltüntetés szükséges lehet), lásd a modellkártyát |
| [piper-wasm](https://github.com/diffusion-studio/piper-wasm) (`vendor/piper`) | MIT, de tartalmazza az [espeak-ng](https://github.com/espeak-ng/espeak-ng) kódot, amely **GPL-3.0** |
| [ONNX Runtime Web](https://github.com/microsoft/onnxruntime) 1.18.0 (`vendor/ort`) | MIT |
| [Lexend](https://github.com/googlefonts/lexend) betűtípus (`fonts`) | SIL Open Font License 1.1 |
| [FrequencyWords](https://github.com/hermitdave/FrequencyWords) magyar szólista (`data/words-hu.txt`, a `hu_50k` lista szűrt változata) | CC BY-SA 4.0 |

Az espeak-ng GPL-3.0 licence miatt a projekt forráskódja a **GPL-3.0** licenc alatt áll, lásd a [LICENSE](LICENSE) fájlt.
