# Development guide

Dokument opisuje lokalne przygotowanie środowiska, uruchamianie testów oraz
kontrolę jakości kodu w repozytorium `zgrzyt-ai`.

## Wymagane narzędzia

- [uv](https://docs.astral.sh/uv/) — zarządzanie projektami i zależnościami
  Pythona,
- [Bun](https://bun.com/docs) 1.4.2 — runtime, menedżer zależności i runner
  testów JavaScript/TypeScript,
- Docker — opcjonalnie, do lokalnego budowania obrazów.

Poprawność instalacji można sprawdzić poleceniami:

```bash
uv --version
bun --version
docker --version
```

## Organizacja zależności

Każdy komponent jest niezależnym projektem i posiada własny lockfile:

| Komponenty | Konfiguracja | Lockfile |
| --- | --- | --- |
| `backend`, `download`, `embed`, `orchestrator` | `pyproject.toml` | `uv.lock` |
| `frontend`, `speakers` | `package.json` | `bun.lock` |

uv automatycznie tworzy katalog `.venv` wewnątrz komponentu. Środowiska nie
trzeba aktywować — polecenia projektu są uruchamiane przez `uv run`.

## Instalacja zależności

Python — przykład dla komponentu `embed`:

```bash
cd embed
uv sync
```

Analogiczne polecenie można uruchomić w `backend`, `download` lub
`orchestrator`. Pierwsze użycie `uv run` również automatycznie wykona
synchronizację środowiska.

JavaScript/TypeScript:

```bash
cd frontend
bun ci
```

```bash
cd speakers
bun ci
```

`bun ci` instaluje dokładnie wersje zapisane w `bun.lock` i nie modyfikuje
lockfile'a.

## Testy

Polecenia należy uruchamiać wewnątrz wybranego komponentu.

### Python

```bash
uv run pytest
```

Przykład:

```bash
cd embed
uv run pytest
```

### JavaScript/TypeScript

```bash
bun test
```

Polecenie działa zarówno w `frontend`, jak i `speakers`.

## Lintowanie i formatowanie

### Python

Kontrola bez modyfikowania plików:

```bash
uv run ruff check .
uv run ruff format --check .
```

Automatyczne poprawki i formatowanie:

```bash
uv run ruff check --fix .
uv run ruff format .
```

### JavaScript/TypeScript

Kontrola bez modyfikowania plików:

```bash
bun run lint
bun run format:check
```

Automatyczne poprawki i formatowanie:

```bash
bun run lint:fix
bun run format
```

ESLint poprawia wyłącznie obsługiwane reguły. Prettier odpowiada za format kodu
i nie zmienia jego logiki.

## Lokalny build aplikacji webowych

W katalogu `frontend` lub `speakers`:

```bash
bun run build
```

## Zmiana zależności

Dodanie zależności uruchomieniowej Pythona:

```bash
uv add <pakiet>
```

Dodanie zależności deweloperskiej Pythona:

```bash
uv add --dev <pakiet>
```

Dodanie zależności JavaScript/TypeScript:

```bash
bun add <pakiet>
```

Dodanie zależności deweloperskiej JavaScript/TypeScript:

```bash
bun add --dev <pakiet>
```

Powyższe polecenia aktualizują jednocześnie konfigurację projektu i właściwy
lockfile. Zmiany w `pyproject.toml` lub `package.json` powinny być commitowane
razem z odpowiadającym im `uv.lock` lub `bun.lock`.

## Kontrola przed commitem

Dla każdego zmienionego komponentu należy wykonać:

1. testy,
2. lintowanie i kontrolę formatowania,
3. build — jeśli zmieniany był `frontend` albo `speakers`.
