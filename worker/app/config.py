"""Runtime configuration.

Every value here is a secret or an environment-specific endpoint, so nothing has
a default. If one is missing we raise at import time rather than failing later
on the first request.

Field names map to the uppercase env vars case-insensitively, so `supabase_url`
reads SUPABASE_URL. Empty values are rejected too — a `.env` copied from
`.env.example` but never filled in is a missing config, not a valid one.
"""

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    supabase_url: str = Field(min_length=1)
    supabase_service_role_key: str = Field(min_length=1)
    gemini_api_key: str = Field(min_length=1)

    # Has a default, unlike the three above: it is a choice rather than a
    # secret, and every environment should run the same model unless someone
    # deliberately overrides GEMINI_MODEL. Written to analyses.model_version,
    # so changing it here is what makes old rows distinguishable from new.
    gemini_model: str = Field(default="gemini-3.6-flash", min_length=1)

    # How many times a model call may be attempted before giving up. Raise it
    # from the Render dashboard if Gemini is having a bad day -- the backoff
    # between attempts is capped by a total budget, so a larger number costs
    # nothing when the API is healthy and buys patience when it is not.
    gemini_max_attempts: int = Field(default=4, ge=1, le=10)

    @field_validator("*", mode="after")
    @classmethod
    def _not_blank(cls, value: object) -> object:
        # min_length alone would let "   " through. Typed as object and
        # guarded because this runs over every field, and gemini_max_attempts
        # is an int -- calling .strip() on it would raise AttributeError and
        # be reported as a missing configuration.
        if isinstance(value, str) and not value.strip():
            raise ValueError("must not be blank")
        return value


def _load() -> Settings:
    try:
        return Settings()
    except Exception as exc:  # ValidationError, but be blunt about it
        raise RuntimeError(
            "Worker configuration is incomplete. SUPABASE_URL, "
            "SUPABASE_SERVICE_ROLE_KEY and GEMINI_API_KEY must all be set to "
            "non-empty values in the environment (see .env.example).\n\n"
            f"{exc}"
        ) from exc


settings = _load()
