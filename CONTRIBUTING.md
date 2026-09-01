# Contributing

Six components live in this repo, each built into its own image and each versioned
independently. Version numbers are never typed by hand — they are derived from commit
messages — so how a change is described decides what gets released.

## Merging

`main` takes no direct pushes. Everything goes through a pull request, and pull requests are
**squash merged**.


## Pull request titles

```
<type>(<scope>): <summary>
```

| Prefix | Bump | Example |
|---|---|---|
| `fix:` | patch | `1.3.5` → `1.3.6` |
| `feat:` | minor | `1.3.5` → `1.4.0` |
| `feat!:` | **major** | `1.3.5` → `2.0.0` |
| `chore:` `docs:` `ci:` `refactor:` `test:` `style:` | none | `1.3.5` → `1.3.5` |

The `!` is what makes a release major, and it works on any type — `fix!:` bumps the major
just as `feat!:` does. Use it when shipping the new image is **not enough on its own**:
something else has to change in the same window — another component, the Qdrant collection,
an IAM policy, the S3 layout. If a plain rollout is all it takes, it is not a major.

Scope is the component: `feat(embed):`, `fix(backend):`, `feat(speakers)!:`.

Examples:

```
fix(backend): return 502 instead of 500 when OpenAI times out
feat(embed): index youtube_id so re-runs skip embedded episodes
feat(embed)!: chunk on speaker turns instead of fixed windows
chore(ci): bump actions/checkout to v5
```

## How a release happens

1. You merge a pull request into `main`.
2. `release-please` opens, or updates, a single release pull request listing the next version
   and changelog for every component that changed. Nothing is released yet.
3. That PR keeps updating itself as you merge more work. The highest bump wins — ten `fix:`
   PRs and one `feat:` make it a minor.
4. You merge the release PR. **That** is the release: it creates the tags
   (`backend-v1.4.0`, …) and the GitHub releases.
5. The tag triggers a build that pushes the image as `1.4.0`, `1.4`, `1` and `latest`.

Merges to `main` that are not releases still build images, tagged `sha-<commit>` only. 