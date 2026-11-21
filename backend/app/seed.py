from app.db.database import connect, init_db
from app.db.repository import insert_company
from app.engine.workflow import import_upload

DEMO_COMPANIES = (
    ("company-gt", "Empresa A", "Guatemala", "GTQ"),
    ("company-us", "Empresa B", "Estados Unidos", "USD"),
    ("company-mx", "Empresa C", "México", "MXN"),
)

DEMO_FILES = (
    ("company-gt", "empresa-a.csv"),
    ("company-us", "empresa-b.csv"),
    ("company-mx", "empresa-c.csv"),
)


def seed() -> list[dict]:
    from app.config import BACKEND_ROOT

    init_db()
    connection = connect()
    try:
        for company in DEMO_COMPANIES:
            insert_company(connection, *company)
        connection.commit()
        summaries = []
        demo_dir = BACKEND_ROOT / "data" / "demo"
        for company_id, filename in DEMO_FILES:
            content = (demo_dir / filename).read_bytes()
            summaries.append(
                import_upload(
                    connection,
                    company_id=company_id,
                    filename=filename,
                    content=content,
                    dry_run=False,
                )
            )
        return summaries
    finally:
        connection.close()


def main() -> None:
    print("Empresas listas: company-gt, company-us, company-mx")
    for item in seed():
        if item["accepted"] == 0 and item["duplicates"] and item["rejected"] == 0:
            print(f"{item['fileName']}: ya estaba cargado ({item['duplicates']} duplicadas)")
            continue
        print(
            f"{item['fileName']}: aceptadas={item['accepted']} "
            f"duplicadas={item['duplicates']} rechazadas={item['rejected']}"
        )


if __name__ == "__main__":
    main()
