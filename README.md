# Tanie loty z Krakowa

Aplikacja do pilnowania cen Ryanair i Wizz Air na trasach z Krakowa (KRK).

Dla każdej trasy buduje gotowy adres wyszukiwania. „Sprawdź dziś” otwiera stronę przewoźnika z lotniskiem i datami. Cenę, którą zobaczysz, wpisujesz sam. Historia zostaje w `localStorage` tej przeglądarki. Nie ma backendu, bazy ani logowania. Aplikacja nie pobiera taryf ze stron linii.

## Uruchomienie

Potrzebny jest Node.js 20+.

```bash
npm install
npm run dev
```

Serwer deweloperski słucha na [http://127.0.0.1:43123](http://127.0.0.1:43123).

Sprawdzenie listy lotnisk i adresów wyszukiwania:

```bash
npm test
```

## Kierunki

Lista lotnisk pochodzi z informatora połączeń regularnych Kraków Airport na zimę 2026/27 (stan 20 października 2026). W wyborze są tylko Ryanair i Wizz Air.
