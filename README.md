# Music Pocket

Primera versió de la PWA mòbil per enviar cançons al servidor domèstic.

## Estat actual

- Interfície responsive amb estil minimalista.
- Cerca en mode demo.
- Afegir cançons individuals a una cua local.
- Persistència local de la cua amb `localStorage`.
- Configuració de l’URL del servei Windows via Tailscale.
- Contracte inicial de l’API:
  - `GET /api/search?q=...` retorna una llista de pistes.
  - `POST /api/imports` rep `{ spotifyUrl, track }` i retorna la importació creada.

## Connexió real

Quan existeixi el servei Windows, introdueix la seva URL a Configuració, per exemple `http://100.x.x.x:8787`. La PWA farà les peticions directament per Tailscale.

El servei Windows serà el responsable de Telegram/Telethon, de la cua persistent, de la comparació amb Navidrome i de la còpia a `O:\\Musica`. Aquesta PWA no conté credencials de Spotify, Telegram ni Navidrome.

## Publicació

El contingut és buildless i es pot publicar amb GitHub Pages apuntant a aquesta carpeta o copiant-ne els fitxers a `dist/`.
