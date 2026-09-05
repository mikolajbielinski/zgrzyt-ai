# Changelog

## [1.1.0](https://github.com/mikolajbielinski/zgrzyt-ai/compare/embed@v1.0.0...embed@v1.1.0) (2026-09-05)


### Features

* Added config loader without defaults. ([7a48d3f](https://github.com/mikolajbielinski/zgrzyt-ai/commit/7a48d3f4baa0048b448db4b736881a5bc58b4d0d))
* Before embed used aws cli, now uses boto3 and does not download transcripts to PVC. Now for reading only uses boto3 ([8daae19](https://github.com/mikolajbielinski/zgrzyt-ai/commit/8daae1994de55d3fa8c78a8ae1a386454c6a5425))
* Before embed used aws cli, now uses boto3 and does not download… ([c4a25bd](https://github.com/mikolajbielinski/zgrzyt-ai/commit/c4a25bd52a271e1049bfaa6a6104cc36b7941e4e))
* Script for downloading transcripts and chunking. New docker image name for downloading mp3 ([4139a40](https://github.com/mikolajbielinski/zgrzyt-ai/commit/4139a40b4ae3114f06b01e1409e2493a95447e52))
* Security changes ([4c1a6ac](https://github.com/mikolajbielinski/zgrzyt-ai/commit/4c1a6ac88167390a4afed76f8a0f1a32da3cf892))


### Bug Fixes

* Embed fix with a lot of transcripts, one scroll instead of 352 filtered counts, payload index, longer timeout ([76c8bcb](https://github.com/mikolajbielinski/zgrzyt-ai/commit/76c8bcbf638ef6e92b1881f7947e9d41ac4e11f5))
