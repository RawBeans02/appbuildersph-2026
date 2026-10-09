#!/bin/sh
# Vercel's ignoreCommand (vercel.json): exit 0 skips the build, exit 1 builds.
# Explicit deploys only (the Hobby plan's daily deployment cap): a commit
# builds only when its message contains "[deploy]" (the Lead batches everyone's
# work into one deploy commit), or when there's no previous deployment.
# A "[deploy]" commit still skips when every file changed since the last
# deployment is docs, design, tests or CI: *.md, docs/, design/, e2e/,
# .github/. Anything unclear builds: a previous deployment the clone doesn't
# have, a git error, or no change at all. --no-renames lists both sides of a
# move, so moving an app file into docs/ still builds.
prev="${VERCEL_GIT_PREVIOUS_SHA:-}"
[ -n "$prev" ] || exit 1
case "${VERCEL_GIT_COMMIT_MESSAGE:-}" in
  *"[deploy]"*) ;;
  *)
    echo "No [deploy] in the commit message: skipping the build."
    exit 0
    ;;
esac
git cat-file -e "${prev}^{commit}" 2>/dev/null || exit 1
changed=$(git diff --no-renames --name-only "$prev" HEAD 2>/dev/null) || exit 1
[ -n "$changed" ] || exit 1
if printf '%s\n' "$changed" | grep -Ev '(^|/)[^/]*\.md$|^docs/|^design/|^e2e/|^\.github/' >/dev/null; then
  exit 1
fi
echo "Only docs, design, tests or CI changed since ${prev}: skipping the build."
exit 0
