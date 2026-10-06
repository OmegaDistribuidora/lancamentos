"""Exporta, somente por SELECT, o catalogo contabil da matriz WinThor."""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import oracledb


CORES = [
    "#2563eb", "#16a34a", "#ea580c", "#7c3aed", "#db2777",
    "#0891b2", "#ca8a04", "#4f46e5", "#059669", "#dc2626",
]


def texto(value: object) -> str:
    return str(value or "").strip()


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("Uso: extrair_catalogo_matriz.py <arquivo-destino.json>")

    required = ["ORACLE_HOST", "ORACLE_SERVICE", "ORACLE_USER", "ORACLE_PASSWORD"]
    missing = [name for name in required if not os.environ.get(name)]
    if missing:
        raise SystemExit(f"Variaveis ausentes: {', '.join(missing)}")

    dsn = oracledb.makedsn(
        os.environ["ORACLE_HOST"],
        int(os.environ.get("ORACLE_PORT", "1521")),
        service_name=os.environ["ORACLE_SERVICE"],
    )
    with oracledb.connect(
        user=os.environ["ORACLE_USER"],
        password=os.environ["ORACLE_PASSWORD"],
        dsn=dsn,
    ) as connection:
        connection.call_timeout = 30_000
        with connection.cursor() as cursor:
            cursor.execute("select CODGRUPO, GRUPO from PCGRUPO order by CODGRUPO")
            grupos_oracle = cursor.fetchall()
            cursor.execute("select CODCONTA, CONTA, GRUPOCONTA from PCCONTA order by CODCONTA")
            contas_oracle = cursor.fetchall()

    grupos = [
        {"codigo": texto(codigo), "nome": texto(nome), "cor": CORES[index % len(CORES)]}
        for index, (codigo, nome) in enumerate(grupos_oracle)
    ]
    contas = [
        {"codigo": texto(codigo), "nome": texto(nome), "grupocodigo": texto(grupo_codigo)}
        for codigo, nome, grupo_codigo in contas_oracle
    ]

    codigos_grupos = {item["codigo"] for item in grupos}
    contas_sem_grupo = [item["codigo"] for item in contas if item["grupocodigo"] not in codigos_grupos]
    if contas_sem_grupo:
        raise SystemExit(f"Contas com grupo ausente em PCGRUPO: {', '.join(contas_sem_grupo)}")
    if len({item["codigo"] for item in grupos}) != len(grupos):
        raise SystemExit("PCGRUPO contem codigos duplicados.")
    if len({item["codigo"] for item in contas}) != len(contas):
        raise SystemExit("PCCONTA contem codigos duplicados.")

    destino = Path(sys.argv[1]).resolve()
    destino.parent.mkdir(parents=True, exist_ok=True)
    destino.write_text(
        json.dumps({"origem": "10.85.113.1/PDBCENTRO", "grupos": grupos, "contas": contas}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"Catalogo exportado: {len(grupos)} grupos e {len(contas)} contas.")


if __name__ == "__main__":
    main()
