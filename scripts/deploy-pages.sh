#!/usr/bin/env sh
# Build and publish dist/ to the gh-pages branch.
#
#   npm run deploy
#
# This exists because pushing .github/workflows/ needs the `workflow` OAuth
# scope. Once that is granted, move deploy/pages-workflow.yml into
# .github/workflows/ and every push to main deploys itself — then this script
# is no longer needed.
set -e

npm run build

REMOTE=$(git remote get-url origin)
SHA=$(git rev-parse --short HEAD)

rm -rf .pages
cp -r dist .pages
touch .pages/.nojekyll            # serve the files as-is; no Jekyll pass

cd .pages
git init -q -b gh-pages
git add -A
git -c user.name="$(git -C .. config user.name)" \
    -c user.email="$(git -C .. config user.email)" \
    commit -qm "Deploy $SHA"
git push -qf "$REMOTE" gh-pages
cd ..
rm -rf .pages

echo "published $SHA to gh-pages"
