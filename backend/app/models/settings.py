from sqlalchemy.orm import Mapped, mapped_column

from app.base import Base


class AppSetting(Base):
    """앱 설정 key-value 영속 — 메타 DB(SQLite)에 저장.

    현재 용도는 LLM 모델 태그(키 "ollama_model")뿐이다. 모델 태그는 민감정보가
    아니므로(자격증명과 달리) 영속해도 stateless 원칙과 충돌하지 않는다.
    필요한 설정이 늘면 키만 추가하면 되는 단일 테이블 구조.
    """

    __tablename__ = "app_settings"

    key: Mapped[str] = mapped_column(primary_key=True)
    value: Mapped[str]
