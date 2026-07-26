#!/bin/sh
# Extract the game's <script> body and syntax-check it.
S=/tmp/claude-0/-home-user-yousef/710ecfb7-b827-55d2-bf06-e3fde3293331/scratchpad
python3 -c "
import sys
s=open('index.html',encoding='utf8').read()
i=s.index('<script>')+8; j=s.rindex('</script>')
open('$S/_body.js','w',encoding='utf8').write(s[i:j])
"
node --check "$S/_body.js" && echo "SYNTAX OK"
