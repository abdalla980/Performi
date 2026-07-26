import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.models.agency import Agency
from app.models.client import Client
from app.models.client_asset import ClientAsset
from app.schemas.client_asset import ClientAssetResponse
from app.security import get_current_agency
from app.services.asset_storage import InvalidAssetError, save_client_asset
from app.services.audit import record_audit_event

router = APIRouter(prefix="/clients", tags=["client-assets"])


def _get_owned_client(db: Session, client_id: uuid.UUID, agency: Agency) -> Client:
    client = db.get(Client, client_id)
    if client is None or client.agency_id != agency.id:
        raise HTTPException(status_code=404, detail="Client not found")
    return client


def client_logo_url(client: Client) -> str | None:
    for asset in client.assets:
        if asset.kind == "logo":
            return f"/uploads/{asset.stored_path}"
    return None


def to_client_asset_response(asset: ClientAsset) -> ClientAssetResponse:
    return ClientAssetResponse(
        id=asset.id,
        kind=asset.kind,
        filename=asset.filename,
        url=f"/uploads/{asset.stored_path}",
        created_at=asset.created_at,
    )


@router.post("/{client_id}/assets", response_model=ClientAssetResponse)
async def upload_asset(
    client_id: uuid.UUID,
    kind: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    agency: Agency = Depends(get_current_agency),
) -> ClientAssetResponse:
    client = _get_owned_client(db, client_id, agency)
    if kind not in ("logo", "image"):
        raise HTTPException(status_code=422, detail="kind must be 'logo' or 'image'")

    contents = await file.read()
    try:
        stored_path = save_client_asset(client_id, file, contents)
    except InvalidAssetError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    asset = ClientAsset(client_id=client.id, kind=kind, filename=file.filename or "upload", stored_path=stored_path)
    db.add(asset)
    db.commit()
    db.refresh(asset)

    record_audit_event(
        db, agency_id=agency.id, client_id=client.id, event_type="client.asset_uploaded", payload={"kind": kind}
    )
    return to_client_asset_response(asset)


@router.delete("/{client_id}/assets/{asset_id}")
def delete_asset(
    client_id: uuid.UUID,
    asset_id: uuid.UUID,
    db: Session = Depends(get_db),
    agency: Agency = Depends(get_current_agency),
) -> dict[str, str]:
    client = _get_owned_client(db, client_id, agency)
    asset = db.get(ClientAsset, asset_id)
    if asset is None or asset.client_id != client.id:
        raise HTTPException(status_code=404, detail="Asset not found")

    settings = get_settings()
    (Path(settings.uploads_dir) / asset.stored_path).unlink(missing_ok=True)

    db.delete(asset)
    db.commit()

    record_audit_event(
        db, agency_id=agency.id, client_id=client.id, event_type="client.asset_deleted", payload={"kind": asset.kind}
    )
    return {"status": "deleted"}
