# Lokalna praca

Polecenia poniżej należy uruchamiać z głównego katalogu repozytorium, chyba że
przy danym poleceniu podano inaczej.

## Pierwsza instalacja

Potrzebne są dwa narzędzia dostępne w `PATH`:

```bash
uv --version
bun --version
```

`uv` sam tworzy i aktualizuje `.venv` wewnątrz danego komponentu. Nie
aktywujemy go i nie instalujemy zależności przez `pip`. Pierwsze `uv run`
automatycznie zsynchronizuje środowisko z `pyproject.toml` i `uv.lock`.

Zależności TypeScriptu instalujemy osobno w obu aplikacjach:

```bash
(cd frontend && bun install --frozen-lockfile)
(cd speakers && bun install --frozen-lockfile)
```

Po zmianie zależności uruchamiamy `bun install`, aby zaktualizować
`bun.lock`. W automatyzacji i podczas kontroli czystej instalacji używamy
`bun ci`.

## Testy

Każdy komponent Pythona uruchamiamy osobno, ponieważ zawiera własny moduł
`main.py`:

```bash
for component in backend download embed orchestrator; do
  (cd "$component" && uv run pytest)
done
```

Pojedynczy komponent:

```bash
(cd embed && uv run pytest)
```

Testy TypeScript:

```bash
(cd frontend && bun test)
(cd speakers && bun test)
```

## Lint i formatowanie

Sprawdzenie Pythona bez zmieniania plików:

```bash
for component in backend download embed orchestrator; do
  (cd "$component" && uv run ruff check . && uv run ruff format --check .)
done
```

Automatyczne poprawki i formatowanie Pythona:

```bash
for component in backend download embed orchestrator; do
  (cd "$component" && uv run ruff check --fix . && uv run ruff format .)
done
```

Sprawdzenie TypeScriptu:

```bash
(cd frontend && bun run lint && bun run format:check)
(cd speakers && bun run lint && bun run format:check)
```

Automatyczne poprawki i formatowanie TypeScriptu:

```bash
(cd frontend && bun run lint:fix && bun run format)
(cd speakers && bun run lint:fix && bun run format)
```

ESLint potrafi automatycznie naprawić tylko część problemów. Prettier odpowiada
za układ kodu, ale nie zmienia jego logiki.

## Kontrola przed commitem

Po testach i lintowaniu warto sprawdzić również build obu aplikacji:

```bash
(cd frontend && bun run build)
(cd speakers && bun run build)
```
