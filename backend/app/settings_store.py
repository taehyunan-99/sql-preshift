"""앱 설정 영속 접근 — app_settings 테이블의 key-value get/set.

LLM 모델 태그처럼 런타임에 바뀌고 재시작 후에도 유지돼야 하는 값을 다룬다.
설정이 비어 있으면 config 기본값으로 폴백한다(설정값 > config 기본).
"""

from __future__ import annotations

from app.config import settings
from app.db import MetaSession
from app.models.settings import AppSetting

_CHAT_MODEL_KEY = "ollama_model"


def _get(key: str) -> str | None:
    with MetaSession() as session:
        row = session.get(AppSetting, key)
        return row.value if row else None


def _set(key: str, value: str) -> None:
    with MetaSession() as session:
        row = session.get(AppSetting, key)
        if row:
            row.value = value
        else:
            session.add(AppSetting(key=key, value=value))
        session.commit()


def current_chat_model() -> str:
    """NL→SQL 추론 모델 태그 — 설정값이 있으면 그것, 없으면 config 기본."""
    return _get(_CHAT_MODEL_KEY) or settings.ollama_model


def set_chat_model(tag: str) -> None:
    """사용자가 고른 모델 태그를 영속한다."""
    _set(_CHAT_MODEL_KEY, tag)
