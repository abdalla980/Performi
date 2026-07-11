"""
Hand-onboard a client onto the portal via Supabase Auth:
1. Create the client's user in the Supabase dashboard (Authentication > Users > Add user).
2. Copy that user's UID from the dashboard.
3. Find the client's UUID (agency dashboard, or `SELECT id, name FROM clients`).
4. Run (from backend/): python scripts/link_client.py --supabase-user-id <uid> --client-id <client-uuid>
"""
import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.db import SessionLocal
from app.models.client import Client


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--supabase-user-id", required=True)
    parser.add_argument("--client-id", required=True)
    args = parser.parse_args()

    db = SessionLocal()
    try:
        client = db.get(Client, args.client_id)
        if client is None:
            raise SystemExit(f"No client found with id {args.client_id}")
        client.supabase_user_id = args.supabase_user_id
        db.commit()
        print(f"Linked client {client.id} ({client.name}) to Supabase user {args.supabase_user_id}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
