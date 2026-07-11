"""
Hand-onboard a pilot agency onto Supabase Auth:
1. Create the agency's user in the Supabase dashboard (Authentication > Users > Add user).
2. Copy that user's UID from the dashboard.
3. Run (from backend/): python scripts/link_agency.py --supabase-user-id <uid> --name "Acme" --email owner@acme.test
"""
import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.db import SessionLocal
from app.models.agency import Agency


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--supabase-user-id", required=True)
    parser.add_argument("--name", required=True)
    parser.add_argument("--email", required=True)
    args = parser.parse_args()

    db = SessionLocal()
    try:
        agency = Agency(supabase_user_id=args.supabase_user_id, name=args.name, email=args.email)
        db.add(agency)
        db.commit()
        print(f"Linked agency {agency.id} to Supabase user {args.supabase_user_id}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
