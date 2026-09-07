"""Supabase client.

This uses the service role key, which bypasses RLS. It exists only inside the
worker; the mobile app talks to Supabase with the anon key and relies on RLS.
Any query written here is responsible for its own owner_id filtering.
"""

from functools import lru_cache

from supabase import Client, create_client

from app.config import settings


@lru_cache(maxsize=1)
def get_client() -> Client:
    return create_client(settings.supabase_url, settings.supabase_service_role_key)
