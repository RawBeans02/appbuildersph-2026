#!/bin/sh
# Vercel's ignoreCommand (vercel.json): exit 0 skips the build, exit 1 builds.
# Skips only when every file changed since the last deployed commit is docs,
# design, tests or CI: *.md, docs/, design/, e2e/, .github/. Anything unclear
# builds: no previous commit, one the clone doesn't have, a git error, or no
# change at all. --no-renames lists both sides of a move, so moving an app
# file into docs/ still builds.
prev="${VERCEL_GIT_PREVIOUS_SHA:-}"
[ -n "$prev" ] || exit 1
git cat-file -e "${prev}^{commit}" 2>/dev/null || exit 1
changed=$(git diff --no-renames --name-only "$prev" HEAD 2>/dev/null) || exit 1
[ -n "$changed" ] || exit 1
if printf '%s\n' "$changed" | grep -Ev '(^|/)[^/]*\.md$|^docs/|^design/|^e2e/|^\.github/' >/dev/null; then
  exit 1
fi
echo "Only docs, design, tests or CI changed since ${prev}: skipping the build."
exit 0
