Set-Location -LiteralPath $PSScriptRoot
node --env-file-if-exists=.env.local server.mjs
