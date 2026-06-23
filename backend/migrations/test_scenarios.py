"""실수 시나리오 E2E 테스트 — SQLPreShift가 어느 상황에서 진가를 발휘하는지 검증.

각 시나리오를 /api/analyze에 던져, 감지된 위험·ERD diff 결과를 요약 출력.
(DB는 건드리지 않음 — analyze는 시뮬레이션만.)
"""

import json
import urllib.request

API = "http://localhost:8000/api/analyze"

# (제목, 설명, SQL) — 현장에서 흔히 저지르는 위험한 실수들.
SCENARIOS = [
    (
        "WHERE 빼먹은 UPDATE",
        "상태 하나만 바꾸려다 WHERE를 빠뜨려 전체 주문이 망가지는 전형적 실수",
        "UPDATE orders SET status = 'cancelled'",
    ),
    (
        "WHERE 빼먹은 DELETE",
        "특정 유저 리뷰만 지우려다 WHERE 없이 전체 리뷰 삭제",
        "DELETE FROM reviews",
    ),
    (
        "참조되는 허브 테이블 DROP",
        "users를 지우면 addresses/orders/reviews가 전부 끊김 — FK 연쇄 위험",
        "DROP TABLE users",
    ),
    (
        "참조되는 컬럼/테이블 CASCADE DROP",
        "CASCADE로 강제 삭제 — 의존 객체까지 연쇄 삭제되는 위험",
        "DROP TABLE products CASCADE",
    ),
    (
        "DEFAULT 없는 NOT NULL 컬럼 추가",
        "기존 행이 있는 orders에 NOT NULL 컬럼을 DEFAULT 없이 추가 → 기존 행 오류",
        "ALTER TABLE orders ADD COLUMN coupon_code VARCHAR(50) NOT NULL",
    ),
    (
        "사용 중인 컬럼 DROP",
        "order_items가 참조하는 products의 price 컬럼 삭제",
        "ALTER TABLE products DROP COLUMN price",
    ),
    (
        "TRUNCATE",
        "테스트 후 정리한다고 운영 테이블을 TRUNCATE",
        "TRUNCATE payments",
    ),
    (
        "안전한 변경(대조군)",
        "위험하지 않은 정상 마이그레이션 — 위험 0건이어야 정상",
        "ALTER TABLE products ADD COLUMN sku VARCHAR(50)",
    ),
]


def analyze(sql: str, prior=None) -> dict:
    body = json.dumps({"input": sql, "priorSqls": prior or []}).encode()
    req = urllib.request.Request(
        API, data=body, headers={"Content-Type": "application/json"}
    )
    try:
        with urllib.request.urlopen(req) as resp:
            return {"status": resp.status, "body": json.loads(resp.read())}
    except urllib.error.HTTPError as e:
        return {"status": e.code, "body": json.loads(e.read())}


def summarize(res: dict) -> dict:
    """analyze 결과에서 핵심만 추출."""
    if res["status"] != 200:
        return {"http": res["status"], "detail": res["body"].get("detail")}
    b = res["body"]
    diff_nodes = {
        n["table"]: n["diff"]
        for n in b["schemaDiff"]["after"]["nodes"]
        if n["diff"] != "unchanged"
    }
    return {
        "http": 200,
        "risks": [
            {"level": r["level"], "rule": r["rule"], "tables": r.get("tables")}
            for r in b.get("risks", [])
        ],
        "hasCritical": any(r["level"] == "critical" for r in b.get("risks", [])),
        "changedNodes": diff_nodes,
    }


def main():
    out = []
    for title, desc, sql in SCENARIOS:
        s = summarize(analyze(sql))
        out.append({"title": title, "desc": desc, "sql": sql, "result": s})

    with open("scenario_results.json", "w") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)

    # 콘솔 요약(짧게)
    for o in out:
        r = o["result"]
        crit = "CRIT" if r.get("hasCritical") else ("WARN" if r.get("risks") else "SAFE")
        rules = ",".join(x["rule"] for x in r.get("risks", [])) or "-"
        print(f"[{crit}] {o['title']:30} | rules={rules} | changed={r.get('changedNodes', {})}")

    print("\n전체 결과 → scenario_results.json")


if __name__ == "__main__":
    main()
