"""Mock SAP S/4HANA OData & BAPI Gateway (Port 8090).

Provides standalone REST mock for testing when FastMCP is used with external ERP connectors.
"""

from typing import Any, Dict
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import uvicorn

app = FastAPI(title="Mock SAP S/4HANA OData Gateway", version="1.0.0")

SAP_INVENTORY = {
    "DC-ATX-02": {"SKU-4089-HYDRATE": 4800, "SKU-1022-PROTEIN": 2900, "SKU-8821-SNACK": 6500},
    "DC-HOU-01": {"SKU-4089-HYDRATE": 3200},
    "DC-SAT-03": {"SKU-4089-HYDRATE": 2200},
}


class STORequest(BaseModel):
    supplying_plant: str
    receiving_plant: str
    material: str
    quantity: int


@app.get("/sap/opu/odata/sap/API_MATERIAL_STOCK_SRV/A_MaterialStock")
def get_stock(plant: str, material: str):
    stock = SAP_INVENTORY.get(plant, {}).get(material, 0)
    return {
        "d": {
            "Plant": plant,
            "Material": material,
            "MatlWrhsStkQtyInMatlBaseUnit": stock,
            "BaseUnit": "EA",
        }
    }


@app.post("/sap/opu/odata/sap/API_PURCHASEORDER_PROCESS_SRV/A_PurchaseOrder")
def create_stock_transfer_order(req: STORequest):
    stock = SAP_INVENTORY.get(req.supplying_plant, {}).get(req.material, 0)
    if stock < req.quantity:
        raise HTTPException(status_code=400, detail="Deficit of stock in supplying plant.")

    SAP_INVENTORY[req.supplying_plant][req.material] -= req.quantity
    sto_id = "450099214"
    return {
        "d": {
            "PurchaseOrder": sto_id,
            "PurchaseOrderType": "UB",  # Stock Transport Order
            "SupplyingPlant": req.supplying_plant,
            "ReceivingPlant": req.receiving_plant,
            "Status": "POSTED_TO_SAP",
        }
    }


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8090)
