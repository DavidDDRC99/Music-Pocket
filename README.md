# Music Pocket

Aplicació mòbil per cercar cançons i enviar-les a una biblioteca domèstica.

## Estat actual

- Interfície responsive amb estil minimalista.
- Cerca pública mentre escrius, sense Spotify Premium.
- Cua persistent al servei Windows, compartida entre dispositius.
- Progrés real, historial, duplicats, errors, reintents i cancel·lació de peticions pendents.
- Connexió automàtica des de la URL privada de Tailscale.
- Contracte inicial de l’API:
  - `GET /api/search?q=...` retorna una llista de pistes.
  - `POST /api/imports` rep `{ sourceUrl, track }` i retorna la importació creada.
  - `GET /api/imports` retorna `{ items: [...] }`.
  - `POST /api/imports/:id/retry` i `/cancel` controlen la cua.

## Connexió real

Activa Tailscale a l’iPhone i obre la URL HTTPS privada del servei. La connexió es configura automàticament i no cal copiar una clau. Windows ha d’estar encès i la biblioteca Linux accessible. GitHub Pages continua proporcionant la cerca pública; per importar, obre la versió privada o configura una connexió manual autenticada.

El servei independent compara amb Navidrome, busca una coincidència exacta a Deezer, rep el fitxer de Telegram i verifica la còpia abans d’actualitzar la biblioteca. Aquesta PWA no conté credencials de Telegram ni Navidrome. Els enllaços directes de Spotify tenen una dependència externa actualment no disponible: utilitza el cercador per seleccionar una cançó.

## Publicació

El contingut és buildless i es pot publicar amb GitHub Pages apuntant a aquesta carpeta o copiant-ne els fitxers a `dist/`.

