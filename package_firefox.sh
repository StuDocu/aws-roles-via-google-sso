#!/bin/env bash
set -Eeuo pipefail

(
cd extension/
mv manifest-firefox.json manifest.json
zip -r -FS ../aws-roles-google-sso.zip *
git checkout .
)
