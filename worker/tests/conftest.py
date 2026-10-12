"""Test environment.

`app.config` loads its settings at import time and raises when any of the
three secrets is missing, which is the behaviour we want in production: a
worker with no Supabase URL should fail to start, not fail on the first
request. In tests it means importing anything under `app.` needs the
variables present first.

Individual test modules were each setting them before their imports. That
works only while at least one such module is collected before any module
that does not, which is alphabetical luck -- `test_analysis_cache.py` sorted
ahead of the file that happened to be holding it up and CI went red while
every local run passed, because a local run has a real `.env` and CI does
not.

conftest.py is imported before any test module, so putting them here makes
it true for every file including the next one somebody adds.

setdefault, not assignment: a real `.env` or a genuinely configured
environment wins, which is what the integration checks in the scratchpad
rely on.
"""

import os

os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key")
os.environ.setdefault("GEMINI_API_KEY", "test-gemini-key")
